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
const { passwordResetOtpSMS, registerSMS, registrationSuccessSMS } = require("../_utils/_helper/smsServices");
const { generateRegistrationSuccessMessage } = require("../_utils/_helper/emailService");
const MIN_DAYS_BETWEEN_DONATIONS = 120;

/**
 * Registers a new user, validates input, checks for existing accounts,  
 * removes unapproved users, and sends an OTP for verification.
 */
const registerUser = asyncHandler(async (req, res) => {
    const { name, mobile, email = "", dob, blood_group, is_weight_50kg, address, password } = req.body;

    // Validate required fields
    const requiredFields = { name, mobile, dob, blood_group, is_weight_50kg, address, password };
    const missingFields = Object.keys(requiredFields).filter(field => !requiredFields[field]);

    if (missingFields.length) {
        return res.status(400).json({ status: 400, message: `Missing required fields: ${missingFields.join(", ")}` });
    }

    // Validate mobile number length
    if (mobile.length !== 11) {
        return res.status(400).json({ status: 400, message: "Mobile number must be 11 digits long." });
    }

    // Check for existing approved users
    const [userExistsWithNumber, userExistsWithEmail] = await Promise.all([
        Auth.findOne({ mobile, isApproved: true }),
        email && Auth.findOne({ email, isApproved: true }),
    ]);

    if (userExistsWithNumber) return res.status(400).json({ status: 400, message: "You already have an account with this number." });
    if (email && userExistsWithEmail) return res.status(400).json({ status: 400, message: "You already have an account with this email." });

    // Delete unapproved users if they exist
    await Promise.all([
        Auth.findOneAndDelete({ mobile, isApproved: false }),
        email && Auth.findOneAndDelete({ email, isApproved: false }),
    ]);

    try {
        const user = await Auth.create({ name, mobile, email, dob, blood_group, is_weight_50kg, address, password });

        if (!user) {
            return res.status(400).json({ status: 400, message: "Failed to create a new user" });
        }

        // Remove this Later when OTP is implemented


         // User is created, now mark as approved, generate token, and return details
         user.isApproved = true;

         // Fetch division, district, and area details
         const [division, district, area] = await Promise.all([
             getDivisionByID(user.address.division_id),
             getDistrictByID(user.address.district_id),
             getAreaByID(user.address.area_id),
         ]);

         // Generate authentication token
         const token = generateToken(user._id);
         user.tokens.push({ token });
         await user.save(); 

     
        // Implement this later when OTP is implemented
        // const otpResponse = await storeOTP({ email }, res);

        // return res.status(201).json({
        //     status: 201,
        //     message: otpResponse.success
        //         ? "User registered successfully. Please check your messages for further instructions."
        //         : "User registered successfully. If you do not receive a verification code, please try again later.",
        // });

        return res.status(201).json({
            status: 201,
            message: "User registered successfully.",
            data: {
                _id: user._id,
                name: user.name,
                mobile: user.mobile,
                email: user.email,
                dob: user.dob,
                occupation: user.occupation, // Will be undefined if not provided during registration and no model default
                blood_group: user.blood_group,
                is_weight_50kg: user.is_weight_50kg,
                isAvailable: user.isAvailable !== undefined ? user.isAvailable : true, // Default to true if not set by model
                isActive: user.isActive !== undefined ? user.isActive : true,       // Default to true if not set by model
                last_donation: user.last_donation,
                pic: user.pic,
                address: {
                    division: division?.name || "",
                    district: district?.name || "",
                    area: area?.name || "",
                    post_office: user.address.post_office,
                },
                access_token: token,
            },
        });

    } catch (error) {
        console.error("Error occurred while registering user:", error);
        return res.status(500).json({ status: 500, message: "Internal server error" });
    }
});

const resendOTP = asyncHandler(async (req, res) => {
    const { email } = req.body;
    const userExistsWithEmail = await Auth.findOne({ email });

    if (!userExistsWithEmail) {
        return res.status(400).json({
            status: 400,
            message: "User doesn't exist with this email!",
        });
    }

    try {
        // const otpResponse = await storeOTP(email, res);
        const otpResponse = await storeOTP({ email }, res);
        return res.status(201).json({
            status: 201,
            message: otpResponse.success
                ? "OTP resent successfully. Please check your messages."
                : "Failed to resend OTP. Please try again later.",
        });
    } catch (error) {
        console.error("Error occurred while resending OTP:", error);
        return res.status(500).json({ status: 500, message: "Internal server error" });
    }
});


const OtpMatchForRegister = asyncHandler(async (req, res) => {
    const { email, otp } = req.body;
    if (!email || !otp) {
        return res.status(400).json({
            status: 400,
            message: "Email and OTP are required.",
        });
    }

    try {
        const user = await Auth.findOne({ email });
        const findOtp = await OtpModel.findOne({ email, otp });

        if (!findOtp) {
            return res.status(400).json({
                status: 400,
                message: "Invalid OTP. Please enter the correct OTP.",
            });
        }

        if (findOtp.expire_time < new Date()) {
            return res.status(400).json({
                status: 400,
                message: "OTP has expired. Please request a new OTP.",
            });
        }

        if (!user) {
            return res.status(400).json({
                status: 400,
                message: "User not found. Please register first.",
            });
        }

        // Fetch division, district, and area details
        const [division, district, area] = await Promise.all([
            getDivisionByID(user.address.division_id),
            getDistrictByID(user.address.district_id),
            getAreaByID(user.address.area_id),
        ]);

        // Generate authentication token
        const token = generateToken(user._id);
        user.tokens.push({ token });
        user.isApproved = true;
        findOtp.is_verified = true;
        await user.save();
        await findOtp.save();

        // Send success SMS in production mode
        if (process.env.SMS_MODE === "prod") {
            // registrationSuccessSMS(user.email, user.name);
            generateRegistrationSuccessMessage(user);
        }

        res.status(200).json({
            status: 200,
            message: "Account successfully created.",
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
                    division: division?.name || "",
                    district: district?.name || "",
                    area: area?.name || "",
                    post_office: user.address.post_office,
                },
                access_token: token,
            },
        });
    } catch (error) {
        res.status(500).json({
            status: 500,
            message: "An unexpected error occurred. Please try again later.",
        });
    }
});


const authUser = asyncHandler(async (req, res) => {
    const { username, password } = req.body;

    const user = await Auth.findOne({
        $or: [{ email: username }, { mobile: username }],
        isApproved: true
    });
    // const user = await Auth.findOne({ email, isApproved: true });

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
        throw new Error("Invalid credentials. Please check your login details and try again.");
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

    // Validate mobile number length
    if (requestBody.mobile && requestBody.mobile.length !== 11) {
        return res.status(400).json({
            status: 400,
            message: "Mobile number must be 11 digits long.",
        });
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
        const userExistsWithEmail = await Auth.findOne({ mobile: requestBody.email });

        if (user.mobile !== requestBody.mobile && userExistsWithNumber) {
            res.status(400).json({
                status: 400,
                message: "This mobile number is already associated with another account.",
            });
            return;
        }

        if (user.email !== requestBody.email && userExistsWithEmail) {
            res.status(400).json({
                status: 400,
                message: "This email is already associated with another account.",
            });
            return;
        }

        // Update user profile fields
        user.name = requestBody.name || user.name;
        user.mobile = requestBody.mobile || user.mobile;
        user.email = requestBody.email || user.email;
        user.dob = requestBody.dob || user.dob;
        user.blood_group = requestBody.blood_group || user.blood_group;
        user.is_weight_50kg = requestBody.is_weight_50kg || user.is_weight_50kg;
        user.address = requestBody.address || user.address;
        user.occupation = requestBody.occupation || user.occupation;


        // Save the updated user
        await user.save();

        const currentDate = new Date();
        const lastDonationDate = user.last_donation;
        let isAvailable = true;

        if (lastDonationDate !== null) {
            const daysSinceLastDonation = (currentDate - lastDonationDate) / (1000 * 60 * 60 * 24);
            isAvailable = daysSinceLastDonation > MIN_DAYS_BETWEEN_DONATIONS;
        }


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
                isAvailable: isAvailable,
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
        // const lastDonationDate = user.last_donation;
        const currentDate = new Date();
        const lastDonationDate = user.last_donation;
        let isAvailable = true;

        if (lastDonationDate !== null) {
            const daysSinceLastDonation = (currentDate - lastDonationDate) / (1000 * 60 * 60 * 24);
            isAvailable = daysSinceLastDonation > MIN_DAYS_BETWEEN_DONATIONS;
        }

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
                isAvailable: isAvailable,
                address: {
                    division: getDivision.name ?? "",
                    division_id: user.address.division_id,
                    district: getDistrict.name ?? "",
                    district_id: user.address.district_id,
                    area: getArea.name ?? "",
                    area_id: user.address.area_id,
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

// const requestPasswordReset = asyncHandler(async (req, res) => {
//     const { mobile } = req.body;
//     const userExistsWithNumber = await Auth.findOne({ mobile: mobile });

//     if (!userExistsWithNumber) {
//         res.status(400).json({
//             status: 400,
//             message: "User doesn't exits with this number!",
//         });
//         return;
//     }

//     // If user exists with the provided mobile number, call the storeOTP method
//     const otp = generateOTP();
//     // const data = {
//     //     mobile, otp
//     // }
//     const data = { mobile: mobile, otp: process.env.SMS_MODE === 'prod' ? otp : process.env.TEST_OTP };


//     try {
//         const isStoreOTP = await storeOTP(data, res);
//         // If OTP is successfully stored and the response status is 200, send SMS
//         if (process.env.SMS_MODE === 'prod' && isStoreOTP.status(200)) {
//             passwordResetOtpSMS(mobile, otp);
//         }
//     } catch (error) {
//         console.error("Error occurred while storing OTP:", error);
//         res.status(500).json({
//             status: 500,
//             message: "Internal server error",
//         });
//     }

// })

const changePasswordByMatchingOtp = asyncHandler(async (req, res) => {
    const { email, password } = req.body;

    // Validate required fields
    if (!email || !password) {
        return res.status(400).json({
            status: 400,
            message: "Email and new password are required.",
        });
    }

    try {
        // Fetch user and OTP details in parallel
        const [existingUser, existingOTP] = await Promise.all([
            Auth.findOne({ email }),
            OtpModel.findOne({ email }),
        ]);

        // Check if user exists
        if (!existingUser) {
            return res.status(404).json({
                status: 404,
                message: "No account found with this email.",
            });
        }

        // Check if OTP exists and is verified
        if (!existingOTP || existingOTP.is_verified === false) {
            return res.status(400).json({
                status: 400,
                message: "Invalid or unverified OTP. Please verify your OTP before changing the password.",
            });
        }

        // Hash the new password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Update the password in the database
        await Auth.updateOne({ email }, { password: hashedPassword });

        // Respond with success message
        return res.status(200).json({
            status: 200,
            message: "Your password has been updated successfully.",
        });

    } catch (error) {
        console.error("Error changing password:", error);
        return res.status(500).json({
            status: 500,
            message: "An unexpected error occurred. Please try again later.",
        });
    }
});

// Do not need to apply anymore
async function removeDuplicateEmptyEmails() {
    try {
        // Find users with empty email strings
        const usersWithEmptyEmails = await Auth.find({ email: "" });

        if (usersWithEmptyEmails.length > 1) {
            // Skip the first one and update the rest
            for (let i = 1; i < usersWithEmptyEmails.length; i++) {
                await Auth.updateOne({ _id: usersWithEmptyEmails[i]._id }, { $unset: { email: 1 } });
            }
        }
        console.log("Duplicate empty emails removed.");
    } catch (error) {
        console.error("Error removing duplicate empty emails:", error);
    } finally {
        mongoose.disconnect();
    }
}

// This method only for remove unique index for email,
async function dropEmailUniqueIndex() {
    try {
        await Auth.collection.dropIndex("email_1");
        console.log("Unique index on email dropped.");
    } catch (error) {
        console.error("Error dropping unique index on email:", error);
    } finally {
        mongoose.disconnect();
    }
}



module.exports = { registerUser, OtpMatchForRegister, authUser, logout, updateUserProfile, updateProfileActive, getProfileData, changePasswordByMatchingOtp, resendOTP }
