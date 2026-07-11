import { createApp } from "./app";

const PORT = process.env.PORT || 3001;

createApp().listen(PORT, () => {
  console.log(`API is running on port ${PORT}`);
});