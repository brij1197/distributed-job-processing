import uuid
from unittest.mock import patch


def test_health(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_submit_job_creates_pending_row(client):
    with patch("app.routers.jobs.dispatch") as mock_dispatch:
        res = client.post(
            "/jobs/",
            json={"type": "scrape", "payload": {"url": "https://example.com"}},
        )

    assert res.status_code == 201
    body = res.json()
    assert body["type"] == "scrape"
    assert body["status"] == "pending"
    assert body["payload"] == {"url": "https://example.com"}
    assert body["retries"] == 0
    mock_dispatch.assert_called_once()
    assert mock_dispatch.call_args.args[0] == body["id"]


def test_submit_job_rejects_invalid_type(client):
    res = client.post(
        "/jobs/",
        json={"type": "script", "payload": {"command": ["echo", "hi"]}},
    )
    assert res.status_code == 422


def test_submit_job_marks_failed_when_dispatch_raises(client):
    with patch(
        "app.routers.jobs.dispatch",
        side_effect=Exception("redis down"),
    ):
        res = client.post(
            "/jobs/",
            json={"type": "scrape", "payload": {"url": "https://example.com"}},
        )

    assert res.status_code == 503

    list_res = client.get("/jobs/")
    jobs = list_res.json()["jobs"]
    assert len(jobs) == 1
    assert jobs[0]["status"] == "failed"
    assert jobs[0]["error"].startswith("dispatch_failed:")


def test_get_job_returns_the_job(client):
    with patch("app.routers.jobs.dispatch"):
        created = client.post(
            "/jobs/",
            json={"type": "scrape", "payload": {"url": "https://example.com"}},
        ).json()

    res = client.get(f"/jobs/{created['id']}")
    assert res.status_code == 200
    assert res.json()["id"] == created["id"]


def test_get_unknown_job_returns_404(client):
    res = client.get(f"/jobs/{uuid.uuid4()}")
    assert res.status_code == 404


def test_list_jobs_returns_total_and_items(client):
    with patch("app.routers.jobs.dispatch"):
        for _ in range(3):
            client.post(
                "/jobs/",
                json={"type": "scrape", "payload": {"url": "https://example.com"}},
            )

    res = client.get("/jobs/")
    assert res.status_code == 200
    body = res.json()
    assert body["total"] == 3
    assert len(body["jobs"]) == 3


def test_list_jobs_filters_by_status(client):
    with patch("app.routers.jobs.dispatch"):
        client.post(
            "/jobs/",
            json={"type": "scrape", "payload": {"url": "https://example.com"}},
        )
    res = client.get("/jobs/?status=success")
    assert res.status_code == 200
    assert res.json()["total"] == 0


def test_delete_job(client):
    with patch("app.routers.jobs.dispatch"):
        created = client.post(
            "/jobs/",
            json={"type": "scrape", "payload": {"url": "https://example.com"}},
        ).json()

    del_res = client.delete(f"/jobs/{created['id']}")
    assert del_res.status_code == 204
    assert client.get(f"/jobs/{created['id']}").status_code == 404


def test_delete_unknown_job_returns_404(client):
    res = client.delete(f"/jobs/{uuid.uuid4()}")
    assert res.status_code == 404
