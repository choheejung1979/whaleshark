const auth = require("./src/auth");
const tickets = require("./src/tickets");
const checkin = require("./src/checkin");
const dashboard = require("./src/dashboard");

module.exports = {
  ...auth,
  ...tickets,
  ...checkin,
  ...dashboard,
};
