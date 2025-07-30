const TelegramBot = require('node-telegram-bot-api');
const { divisionData } = require('../_utils/data/divisionData');
const { districtData } = require('../_utils/data/districtData');
const Auth = require('../models/AuthModal');

const token = process.env.TELEGRAM_BOT_TOKEN;
const bot = new TelegramBot(token, { polling: true });

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'];
const APP_NAME = 'Rokter Sondhane';

// State management
const userSteps = {};

// Utility to send message with keyboard
const sendMessageWithKeyboard = (chatId, text, options = []) => {
    bot.sendMessage(chatId, text, {
        parse_mode: 'Markdown',
        reply_markup: {
            keyboard: options.map(item => [item]),
            resize_keyboard: true
        }
    });
};

// Utility to send search again button
const sendSearchAgainButton = (chatId) => {
    sendMessageWithKeyboard(chatId, `*${APP_NAME}*\nWould you like to search again?`, ['Search Blood']);
};

// Generate donor profile card
const generateProfileCard = (donor) => {
    const divName = divisionData.find(div => Number(div.id) === donor.address.division_id)?.name || 'N/A';
    const distName = districtData.find(dist => Number(dist.id) === donor.address.district_id)?.name || 'N/A';
    const phone = donor.mobile ? `<a href="tel:${donor.mobile}"><u>${donor.mobile}</u></a>` : 'N/A';

    return `
<b>${donor.name}</b>
Blood Group: ${donor.blood_group}
Mobile: ${phone}
Division: ${divName}
District: ${distName}
Address: ${donor.address.post_office || 'N/A'}
-------------------
    `;
};

// Start command handler
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    sendMessageWithKeyboard(
        chatId,
        `*${APP_NAME}*\nWelcome to Rokter Sondhane Blood Search Bot!\nPlease select a Blood Group:`,
        BLOOD_GROUPS
    );
    userSteps[chatId] = { step: 'bloodGroup' };
});

// Message handler
bot.on('message', async (msg) => {
    const text = msg.text?.trim().toLowerCase();
    const chatId = msg.chat.id;
    
    if (!userSteps[chatId]) userSteps[chatId] = { step: 'start' };

    switch (userSteps[chatId].step) {
        case 'start':
            if (text === 'start' || text === 'search blood') {
                sendMessageWithKeyboard(
                    chatId,
                    `*${APP_NAME}*\nPlease select a Blood Group:`,
                    BLOOD_GROUPS
                );
                userSteps[chatId].step = 'bloodGroup';
            } else {
                sendMessageWithKeyboard(
                    chatId,
                    `*${APP_NAME}*\nPlease click "Search Blood" or send "start" to begin.`,
                    ['Search Blood']
                );
            }
            break;

        case 'bloodGroup':
            if (BLOOD_GROUPS.includes(msg.text)) {
                userSteps[chatId].bloodGroup = msg.text;
                sendMessageWithKeyboard(
                    chatId,
                    `*${APP_NAME}*\nSelect Division:`,
                    divisionData.map(d => d.name)
                );
                userSteps[chatId].step = 'division';
            } else {
                sendMessageWithKeyboard(
                    chatId,
                    `*${APP_NAME}*\nInvalid blood group. Please select a valid Blood Group:`,
                    BLOOD_GROUPS
                );
            }
            break;

        case 'division':
            const division = divisionData.find(d => d.name === msg.text);
            if (division) {
                userSteps[chatId].division_id = division.id;
                const districts = districtData.filter(dist => dist.parent_id === division.id);
                sendMessageWithKeyboard(
                    chatId,
                    `*${APP_NAME}*\nSelect District:`,
                    districts.map(d => d.name)
                );
                userSteps[chatId].step = 'district';
            } else {
                sendMessageWithKeyboard(
                    chatId,
                    `*${APP_NAME}*\nInvalid division. Please select a valid Division:`,
                    divisionData.map(d => d.name)
                );
            }
            break;

        case 'district':
            const district = districtData.find(d => d.name === msg.text);
            if (district) {
                userSteps[chatId].district_id = district.id;
                try {
                    const donors = await Auth.aggregate([
                        {
                            $match: {
                                blood_group: userSteps[chatId].bloodGroup,
                                isActive: true,
                                'address.division_id': Number(userSteps[chatId].division_id),
                                'address.district_id': Number(userSteps[chatId].district_id)
                            }
                        },
                        { $sample: { size: 20 } }
                    ]);

                    bot.sendMessage(chatId, donors.length > 0
                        ? `<b>${APP_NAME}</b>\n<b>Donors Found (${donors.length})</b> :\n${donors.map(generateProfileCard).join('\n')} `
                        : `<b>${APP_NAME}</b>\n\n*No donors found for your selection.*`, {
                        parse_mode: 'HTML'
                    });
                    sendSearchAgainButton(chatId);
                    userSteps[chatId].step = 'start';
                } catch (error) {
                    bot.sendMessage(chatId, `*${APP_NAME}*\n\n*Error occurred while searching. Please try again.*`, {
                        parse_mode: 'Markdown'
                    });
                    sendSearchAgainButton(chatId);
                    userSteps[chatId].step = 'start';
                }
            } else {
                const districts = districtData.filter(dist => dist.parent_id === userSteps[chatId].division_id);
                sendMessageWithKeyboard(
                    chatId,
                    `*${APP_NAME}*\nInvalid district. Please select a valid District:`,
                    districts.map(d => d.name)
                );
            }
            break;

        default:
            sendMessageWithKeyboard(
                chatId,
                `*${APP_NAME}*\nPlease click "Search Blood" or send "start" to begin.`,
                ['Search Blood']
            );
            userSteps[chatId].step = 'start';
            break;
    }
});

module.exports = bot;
