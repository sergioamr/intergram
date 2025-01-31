const request = require('request');
const compression = require('compression');
const cors = require('cors');
const express = require('express');
const bodyParser = require('body-parser');
const app = express();
const https = require('https')
const http = require('http').Server(app);
const io = require('socket.io')(http, { path: '/chat.io/'});

console.log("Start " + process.env.TELEGRAM_TOKEN);

app.use(express.static('dist', {
    index: 'demo.html',
    maxage: '4h'
}));
app.use(bodyParser.json());

global.last_update_id = -1;
global.last_user_id = false;
global.number_users = 0;
global.number_messages = 0;
global.private_chat = false;

function send_status(chatId) {
    sendTelegramMessage(chatId,
        "- Selected user [" + global.last_user_id+ "]\n" +
        "- Users online " + global.number_users + "\n" +
        "- Total messages " + global.number_messages + "\n");
}

function fetch_updates() {
    var url = 'https://api.telegram.org/bot' + process.env.TELEGRAM_TOKEN + '/getUpdates?offset=' + global.last_update_id;
    //console.log(url);
    https.get(url, function (res) {
        var body = '';

        res.on('data', function (chunk) {
            body += chunk;
        });

        res.on('end', function () {
            var t_response = JSON.parse(body);
            //console.log("Got a response: ", t_response);
            var telegram_response = t_response.result;

            if (!telegram_response) {
                return;
            }

            try {

                for (i = 0; i < telegram_response.length; i++) {
                    const message = telegram_response[i].message;

                    if (telegram_response[i].update_id != global.last_update_id) {
                        global.last_update_id = telegram_response[i].update_id;
                        console.log("Message: ", message);
                        console.log("chat: ", message['chat']);
                        console.log("id: ", message.chat.id);

                        const chatId = message.chat.id;
                        const name = message.chat.first_name || message.chat.title || "admin";
                        const text = message.text || "";
                        const reply = message.reply_to_message;

                        if (text.startsWith("/")) {
                            if (text.startsWith("/start")) {
                                console.log("/start chatId " + chatId);
                                sendTelegramMessage(chatId,
                                    "*Welcome to Intergram* \n" +
                                    "Your unique chat id is `" + chatId + "`\n" +
                                    "Use it to link between the embedded chat and this telegram chat",
                                    "Markdown");
                            } else
                            if (text.startsWith("/status")) {
                                send_status(chatId);
                            }

                            // A command will always disable the automatic chat
                            // so we don't send random stuff to the website user
                            if (global.last_user_id != false || global.private_chat) {
                                sendTelegramMessage(chatId, " ==== PRIVATE CHAT ==== ");
                                global.last_user_id = false;
                                global.private_chat = true;
                            }
                        } else
                        if (reply) {
                            let replyText = reply.text || "";
                            let userId = replyText.split(':')[0];

                            if (userId != global.last_user_id) {
                                global.last_user_id = userId;
                                global.private_chat = false;
                                sendTelegramMessage(chatId, userId + ":: Selected to Chat ");
                            }

                            io.emit(chatId + "-" + userId, {
                                name,
                                text,
                                from: 'admin'
                            });

                        } else
                        if (text && !global.private_chat) {
                            if (global.last_user_id != false) {
                                //console.log(" SELECTED " + global.last_user_id);
                                userId = global.last_user_id;
                                io.emit(chatId + "-" + userId, {
                                    name,
                                    text,
                                    from: 'admin'
                                });
                            } else {
                                io.emit(chatId, {
                                    name,
                                    text,
                                    from: 'admin'
                                });
                            }
                        }
                    }
                }

            } catch (e) {
                console.error("hook error", e);
            }
        });
    }).on('error', function (e) {
        console.log("Got an error: ", e);
    });
}

setInterval(fetch_updates, 2000);

app.get('/test', function (req, res) {
    res.send('Hook world')
    fetch_updates();
})

// handle admin Telegram messages
app.post('/hook1', function (req, res) {
    try {
        const message = req.body.message || req.body.channel_post;
        const chatId = message.chat.id;
        const name = message.chat.first_name || message.chat.title || "admin";
        const text = message.text || "";
        const reply = message.reply_to_message;

        // TODO: Rebuild this, we will use hooks later

    } catch (e) {
        console.error("hook error", e, req.body);
    }
    res.statusCode = 200;
    res.end();
});

// handle chat visitors websocket messages
io.on('connection', function (client) {

    client.on('register', function (registerMsg) {
        let userId = registerMsg.userId;
        let chatId = registerMsg.chatId;
        let messageReceived = false;
        console.log("useId " + userId + " connected to chatId " + chatId);

        global.number_users++;

        if (!global.last_user_id) {
            sendTelegramMessage(chatId, userId + ":: Connected and Selected! ");
            global.last_user_id = userId;
        } else {
            sendTelegramMessage(chatId, userId + ":: Connected to ChatID");
        }

        send_status(chatId);

        client.on('message', function (msg) {
            messageReceived = true;
            io.emit(chatId + "-" + userId, msg);
            let visitorName = msg.visitorName ? "[" + msg.visitorName + "]: " : "";
            sendTelegramMessage(chatId, userId + ":" + visitorName + " " + msg.text);

            global.number_messages++;
        });

        client.on('disconnect', function () {
            if (messageReceived) {
            }

            if (userId == global.last_user_id)
                global.last_user_id = false;

            sendTelegramMessage(chatId, userId + ":: has left");
            global.number_users--;
        });
    });

});

function sendTelegramMessage(chatId, text, parseMode) {

    console.log(" SEND MESSAGE " + chatId + " " + text);
    request
        .post('https://api.telegram.org/bot' + process.env.TELEGRAM_TOKEN + '/sendMessage')
        .form({
            "chat_id": chatId,
            "text": text,
            "parse_mode": parseMode
        });
}

app.get('/test', function (req, res) {
    res.send('hello world')
})

app.post('/usage-start', cors(), function (req, res) {
    console.log('usage from', req.query.host);
    res.statusCode = 200;
    res.end();
});

// left here until the cache expires
app.post('/usage-end', cors(), function (req, res) {
    res.statusCode = 200;
    res.end();
});

http.listen(process.env.PORT || 3000, function () {
    console.log('listening on port:' + (process.env.PORT || 3000));
});

app.get("/.well-known/acme-challenge/:content", (req, res) => {
    res.send(process.env.CERTBOT_RESPONSE);
});