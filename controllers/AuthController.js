const asyncHandler = require("express-async-handler");
const res = require("express/lib/response");
const bcrypt = require("bcryptjs");
const Auth = require("../models/AuthModal");
const OtpModel = require("../models/OtpModel");
const { generateToken } = require("../config/generateToken");
const { getDivisionByID, getDistrictByID, getAreaByID, getUnionByID } = require("../_utils/_helper/getAddressById");
const DonationModel = require("../models/DonationModel");
const { storeOTP } = require("./OtpController");
const { generateOTP } = require("../_utils/_helper/OtpGenerate");
const { passwordResetOtpSMS, registerSMS } = require("../_utils/_helper/smsServices");


const registerUser = asyncHandler(async (req, res) => {
    const requestBody = req.body;

    // Ensure required fields are provided
    const requiredFields = ['name', 'mobile', 'dob', 'blood_group', 'is_weight_50kg', 'address', 'password'];
    const missingFields = requiredFields.filter(field => !requestBody[field]);

    if (missingFields.length > 0) {
        res.status(400).json({
            status: 400,
            message: `Please provide all required fields: ${missingFields.join(', ')}`,
        });
        return;
    }

    // Check if user already exists with Approved
    const userExistsWithNumber = await Auth.findOne({ mobile: requestBody.mobile, isApproved: true });
    const userExitsWithEmail = await Auth.findOne({ email: requestBody.email, isApproved: true });

    const unApprovedWithMobile = await Auth.findOne({ mobile: requestBody.mobile, isApproved: false });
    const unApprovedWithEmail = await Auth.findOne({ email: requestBody.email, isApproved: false });

    if (userExistsWithNumber) {
        res.status(400).json({
            status: 400,
            message: "You already have an account with this number.",
        });
        return;
    }
    if (userExitsWithEmail) {
        res.status(400).json({
            status: 400,
            message: "You already have an account with this email.",
        });
        return;
    }

    // If unapproved user exists with the provided mobile or email, delete it
    if (unApprovedWithMobile) {
        const removedUser = await Auth.findOneAndDelete({ mobile: requestBody.mobile, isApproved: false });
        // console.log("Unapproved user with mobile deleted:", removedUser);
    }
    if (unApprovedWithEmail) {
        const removedUser = await Auth.findOneAndDelete({ email: requestBody.email, isApproved: false });
        // console.log("Unapproved user with email deleted:", removedUser);
    }
    // If user exists with the provided mobile number, call the storeOTP method
    const otp = generateOTP();
    const data = { mobile: requestBody.mobile, otp: otp };
    try {
        const user = await Auth.create(requestBody);

        if (user) {
            const isStoreOTP = await storeOTP(data, res);
            if (isStoreOTP.status(200)) {
                registerSMS(requestBody.mobile, requestBody.name, otp);
            }
        } else {
            res.status(400).json({
                status: 400,
                message: "Failed to create a new user",
            });
        }
        // If OTP is successfully stored and the response status is 200, send SMS

    } catch (error) {
        console.error("Error occurred while storing OTP:", error);
        res.status(500).json({
            status: 500,
            message: "Internal server error",
        });
    }
});

const OtpMatchForRegister = asyncHandler(async (req, res) => {
    // Create a new user with all the provided fields
    // const user = await Auth.create(requestBody);

    const { mobile, otp } = req.body;
    const user = await Auth.findOne({ mobile: mobile });
    const findOtpByMobile = await OtpModel.findOne({ mobile: mobile, otp: otp });

    if (!findOtpByMobile) {
        res.status(400).json({
            status: 400,
            message: "OTP doesn't match!",
        });
        return;
    }

    // Check if OTP has expired
    const currentTime = new Date();
    if (findOtpByMobile.expire_time < currentTime) {
        res.status(400).json({
            status: 400,
            message: "OTP has expired!",
        });
        return;
    }


    if (user) {

        const getDivision = await getDivisionByID(user.address.division_id);
        const getDistrict = await getDistrictByID(user.address.district_id);
        const getArea = await getAreaByID(user.address.area_id);

        // Generate token, save it to user, and save the user
        const token = generateToken(user._id);
        user.tokens.push({ token });
        user.isApproved = true;
        await user.save();

        res.status(200).json({
            status: 200,
            message: "You have been successfully created a new account",
            data: {
                _id: user._id,
                name: user.name,
                mobile: user.mobile,
                email: user.email,
                dob: user.dob,
                occupation: user.occupation,
                blood_group: user.blood_group,
                is_weight_50kg: user.is_weight_50kg,
                isAvailable: user.isAvailable,
                isActive: user.isActive,
                last_donation: user.last_donation,
                pic: user.pic,
                address: {
                    division: getDivision.name ?? "",
                    district: getDistrict.name ?? "",
                    area: getArea.name ?? "",
                    post_office: user.address.post_office,
                },
                access_token: token,
            },

        });
    } else {
        res.status(400).json({
            status: 400,
            message: "Failed to create a new user",
        });
    }
})

const authUser = asyncHandler(async (req, res) => {
    const { mobile, password } = req.body;

    const user = await Auth.findOne({ mobile });

    if (user && (await user.matchPassword(password))) {

        const getDivision = await getDivisionByID(user.address.division_id);
        const getDistrict = await getDistrictByID(user.address.district_id);
        const getArea = await getAreaByID(user.address.area_id);

        const token = generateToken(user._id);
        user.tokens.push({ token });
        await user.save();

        res.status(200).json({
            status: 200,
            message: "Login successfully.",
            data: {
                _id: user._id,
                name: user.name,
                mobile: user.mobile,
                email: user.email,
                dob: user.dob,
                occupation: user.occupation,
                blood_group: user.blood_group,
                isAvailable: user.isAvailable,
                isActive: user.isActive,
                is_weight_50kg: user.is_weight_50kg,
                last_donation: user.last_donation,
                address: {
                    division: getDivision.name ?? "",
                    district: getDistrict.name ?? "",
                    area: getArea.name ?? "",
                    post_office: user.address.post_office,
                },
                pic: user.pic,
                access_token: token,
            },
        });
    } else {
        res.status(400);
        throw new Error("Mobile or Password do not match!");
    }
})

/**
 * Logout User
 */
const logout = asyncHandler(async (req, res) => {
    const user = req.user; // Assuming the authenticated user is available in req.user
    const token = req.headers.authorization.split(" ")[1]; // Assuming the token is provided in the "Authorization" header as a bearer token
    // Remove the token from the user's tokens array
    const getUser = await Auth.findOne({ _id: user.id });
    getUser.tokens = getUser.tokens.filter((tokenObj) => tokenObj.token !== token);

    await getUser.save();
    res.status(200).json({
        status: 200,
        message: "Logout successful.",
    });
});

// Update auth user data
const updateUserProfile = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const requestBody = req.body;
    // const requiredFields = ['name', 'mobile', 'dob', 'blood_group', 'is_weight_50kg', 'address', 'password'];
    // Ensure required fields are provided
    const requiredFields = ['name', 'mobile', 'dob', 'blood_group', 'is_weight_50kg', 'address'];
    const missingFields = requiredFields.filter(field => !requestBody[field]);

    if (missingFields.length > 0) {
        res.status(400).json({
            status: 400,
            message: `Please provide all required fields: ${missingFields.join(', ')}`,
        });
        return;
    }

    try {
        // Find the user by ID
        const user = await Auth.findById(userId);

        if (!user) {
            res.status(404).json({
                status: 404,
                message: "User does not exit.",
            });
            return;
        }

        // Check if user already exists
        const userExistsWithNumber = await Auth.findOne({ mobile: requestBody.mobile });

        if (userExistsWithNumber) {
            res.status(400).json({
                status: 400,
                message: "This mobile number is already associated with another account.",
            });
            return;
        }

        // Update user profile fields
        user.name = requestBody.name;
        user.mobile = requestBody.mobile;
        user.dob = requestBody.dob;
        user.blood_group = requestBody.blood_group;
        user.is_weight_50kg = requestBody.is_weight_50kg;
        user.address = requestBody.address;
        user.occupation = requestBody.occupation;

        // Save the updated user
        await user.save();

        res.status(200).json({
            status: 200,
            message: "User profile updated successfully",
            data: {
                _id: user._id,
                name: user.name,
                mobile: user.mobile,
                email: user.email,
                dob: user.dob,
                occupation: user.occupation,
                blood_group: user.blood_group,
                is_weight_50kg: user.is_weight_50kg,
                isAvailable: user.isAvailable,
                isActive: user.isActive,
                last_donation: user.last_donation,
                pic: user.pic,
                address: user.address,
            },
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            status: 500,
            message: "Internal server error",
            error: error.message,
        });
    }
});


const updateProfileActive = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { isActive } = req.body;

    try {
        // Find the user by ID
        const user = await Auth.findById(userId);

        if (!user) {
            res.status(404).json({
                status: 404,
                message: "User does not exit.",
            });
            return;
        }

        // Update isActive status
        user.isActive = isActive;

        // Save the updated user
        await user.save();

        res.status(200).json({
            status: 200,
            message: `User profile is now ${isActive ? 'active' : 'inactive'}`,
            data: {
                _id: user._id,
                isActive: user.isActive,
            },
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            status: 500,
            message: "Internal server error",
            error: error.message,
        });
    }
});

const getProfileData = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const user = await Auth.findById(userId);

    if (user) {

        const getDivision = await getDivisionByID(user.address.division_id);
        const getDistrict = await getDistrictByID(user.address.district_id);
        const getArea = await getAreaByID(user.address.area_id);
        const totalDonation = await DonationModel.countDocuments({ donar_id: userId });

        res.status(200).json({
            status: 200,
            message: "User info fetched successfully!",
            data: {
                _id: user._id,
                name: user.name,
                mobile: user.mobile,
                email: user.email,
                dob: user.dob,
                occupation: user.occupation,
                blood_group: user.blood_group,
                isAvailable: user.isAvailable,
                isActive: user.isActive,
                is_weight_50kg: user.is_weight_50kg,
                last_donation: user.last_donation,
                totalDonation: totalDonation,
                address: {
                    division: getDivision.name ?? "",
                    district: getDistrict.name ?? "",
                    area: getArea.name ?? "",
                    post_office: user.address.post_office,
                },
                pic: user.pic,
            },
        });
    } else {
        res.status(400);
        throw new Error("User not found!");
    }
});

const requestPasswordReset = asyncHandler(async (req, res) => {
    const { mobile } = req.body;
    const userExistsWithNumber = await Auth.findOne({ mobile: mobile });

    if (!userExistsWithNumber) {
        res.status(400).json({
            status: 400,
            message: "User doesn't exits with this number!",
        });
        return;
    }

    // If user exists with the provided mobile number, call the storeOTP method
    const otp = generateOTP();
    const data = {
        mobile, otp
    }

    try {
        const isStoreOTP = await storeOTP(data, res);
        // If OTP is successfully stored and the response status is 200, send SMS
        if (isStoreOTP.status(200)) {
            passwordResetOtpSMS(mobile, otp);
        }
    } catch (error) {
        console.error("Error occurred while storing OTP:", error);
        res.status(500).json({
            status: 500,
            message: "Internal server error",
        });
    }

})

const changePasswordByMatchingOtp = asyncHandler(async (req, res) => {
    const { mobile, otp, password } = req.body;
    const userExistsWithNumber = await Auth.findOne({ mobile: mobile });
    const findOtpByMobile = await OtpModel.findOne({ mobile: mobile, otp: otp });

    if (!findOtpByMobile) {
        res.status(400).json({
            status: 400,
            message: "OTP doesn't match!",
        });
        return;
    }

    // Check if OTP has expired
    const currentTime = new Date();
    if (findOtpByMobile.expire_time < currentTime) {
        res.status(400).json({
            status: 400,
            message: "OTP has expired!",
        });
        return;
    }

    // If OTP is valid and not expired, update the password
    if (userExistsWithNumber) {
        try {
            // Generate salt and hash the new password
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(password, salt);

            // Update the password in the database
            await Auth.updateOne({ mobile }, { password: hashedPassword });

            // Respond with success message
            res.status(200).json({
                status: 200,
                message: "Password changed successfully!",
            });
        } catch (error) {
            console.error('Error changing password:', error.message);
            res.status(500).json({
                status: 500,
                message: "Internal server error",
            });
        }
    } else {
        res.status(400).json({
            status: 400,
            message: "User not found!",
        });
    }

})

module.exports = { registerUser, OtpMatchForRegister, authUser, logout, updateUserProfile, updateProfileActive, getProfileData, requestPasswordReset, changePasswordByMatchingOtp }