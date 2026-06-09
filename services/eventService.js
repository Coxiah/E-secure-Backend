let io = null;

const setIO = (ioInstance) => {
  io = ioInstance;
};

const emitNewSignal = (recipientId, signalData) => {
  if (io) {
    // In production, send to specific room. For now, broadcast to all.
    io.emit("new_signal", { recipientId, ...signalData });
  }
};

const emitAcknowledgment = (signalId, userId, acknowledgedAt) => {
  if (io) {
    io.emit("signal_acknowledged", { signalId, userId, acknowledgedAt });
  }
};

const emitEmergency = (signalData) => {
  if (io) {
    io.emit("emergency_broadcast", signalData);
  }
};

module.exports = { setIO, emitNewSignal, emitAcknowledgment, emitEmergency };
