const app = require("./app");
const { startExpiryJob } = require("./services/expiryService");
const http = require("http");
const socketIO = require("socket.io");
const eventService = require("./services/eventService");
require("dotenv").config();

const PORT = process.env.PORT || 5000;

const server = http.createServer(app);
const io = socketIO(server, {
  cors: {
    origin: "*", // In production, restrict to your frontend domains
    methods: ["GET", "POST"],
  },
});

// Make io accessible to event service
eventService.setIO(io);

io.on("connection", (socket) => {
  console.log("New client connected:", socket.id);
  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  startExpiryJob();
});
