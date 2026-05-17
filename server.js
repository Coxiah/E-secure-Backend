require("dotenv").config({ debug: true });
const app = require("./app");

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log("DB_USER from env:", process.env.DB_USER);
});
