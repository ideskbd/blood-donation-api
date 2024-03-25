const express = require("express");
const { registerUser, authUser, logout, updateUserProfile, updateProfileActive,verifyOTP } = require("../controllers/AuthController");
const { authenticateToken } = require("../config/generateToken");
const AuthRouter = express.Router();

AuthRouter.route('/').post(registerUser)
AuthRouter.post('/login', authUser);
AuthRouter.post("/logout", authenticateToken, logout);
AuthRouter.post("/verifyOtp", authenticateToken, verifyOTP);
// AuthRouter.route('/profile-update').put(authenticateToken, updateUserProfile)
// AuthRouter.route('/profile-activation').put(authenticateToken, updateProfileActive)
AuthRouter.put("/profile-update", authenticateToken, updateUserProfile);
AuthRouter.put("/profile-activation", authenticateToken, updateProfileActive);


module.exports = AuthRouter;