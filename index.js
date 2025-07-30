const express = require("express");
const dotenv = require("dotenv");
const connectDB = require("./config/db");
const colors = require("colors");
const { notFound, errorHandler } = require("./middleware/errorMiddleware");
var cors = require('cors');
const AuthRouter = require("./routes/AuthRoute");
// const DivisionRoute = require("./routes/DivisionsRoute");
// const DistrictRoute = require("./routes/DistrictRoute");
const AddressRoute = require("./routes/DefaultAddressRoute");
const DonationRoute = require("./routes/DonationRoute");
const SearchDonar = require("./routes/SearchBloodRoute");


// Telegram Bot
require("./controllers/TelegramBotController");
const TelegramBotRoute = require("./routes/TelegramBotRoute");


dotenv.config();

const PORT = process.env.PORT || 4200;
const HOST = process.env.HOST || '192.168.10.124';
const app = express();
app.use(cors())
connectDB();

app.use(express.json()); //to accept json data;

app.get('/', (req, res) => {
    res.send("Yahoo! APP is running successfully!");
});


app.use('/v1/auth', AuthRouter);
app.use('/v1', AddressRoute);
app.use('/v1', DonationRoute);
app.use('/v1', SearchDonar);

app.use(notFound);
app.use(errorHandler);

app.listen(PORT, HOST, () => {
    console.log(`Server running at http://${HOST}:${PORT}`);
});

// app.listen(PORT, console.log(`Server start on PORT ${PORT}`.yellow.bold));
