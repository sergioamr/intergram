const request = require('request');
const compression = require('compression');
const cors = require('cors');
const express = require('express');
const bodyParser = require('body-parser');
const app = express();
const https = require('https')
const http = require('http').Server(app);
const io = require('socket.io')(http);

console.log("Start " + process.env.TELEGRAM_TOKEN);

app.use(express.static('dist', {
    index: 'demo.html',
    maxage: '4h'
}));
app.use(bodyParser.json());

global.last_update_id = -1;

function fetch_updates() {
    var url = 'https://api.telegram.org/bot' + process.env.TELEGRAM_TOKEN + '/getUpdates?offset=' + global.last_update_id;
    console.log(url);
    https.get(url, function (res) {
        var body = '';

        res.on('data', function (chunk) {
            body += chunk;
        });

        res.on('end', function () {
            var t_response = JSON.parse(body);
            var telegram_response = t_response.result;

            //console.log("Got a response: ", telegram_response);

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

                        if (text.startsWith("/start")) {
                            console.log("/start chatId " + chatId);
                            sendTelegramMessage(chatId,
                                "*Welcome to Intergram* \n" +
                                "Your unique chat id is `" + chatId + "`\n" +
                                "Use it to link between the embedded chat and this telegram chat",
                                "Markdown");
                        } else if (reply) {
                            let replyText = reply.text || "";
                            let userId = replyText.split(':')[0];
                            io.emit(chatId + "-" + userId, {
                                name,
                                text,
                                from: 'admin'
                            });
                        } else if (text) {
                            io.emit(chatId, {
                                name,
                                text,
                                from: 'admin'
                            });
                        }
                    }
                }

            } catch (e) {
                console.error("hook error", e, req.body);
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

        if (text.startsWith("/start")) {
            console.log("/start chatId " + chatId);
            sendTelegramMessage(chatId,
                "*Welcome to Intergram* \n" +
                "Your unique chat id is `" + chatId + "`\n" +
                "Use it to link between the embedded chat and this telegram chat",
                "Markdown");
        } else if (reply) {
            let replyText = reply.text || "";
            let userId = replyText.split(':')[0];
            io.emit(chatId + "-" + userId, {
                name,
                text,
                from: 'admin'
            });
        } else if (text) {
            io.emit(chatId, {
                name,
                text,
                from: 'admin'
            });
        }

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

        client.on('message', function (msg) {
            messageReceived = true;
            io.emit(chatId + "-" + userId, msg);
            let visitorName = msg.visitorName ? "[" + msg.visitorName + "]: " : "";
            sendTelegramMessage(chatId, userId + ":" + visitorName + " " + msg.text);
        });

        client.on('disconnect', function () {
            if (messageReceived) {
                sendTelegramMessage(chatId, userId + " has left");
            }
        });
    });

});

function sendTelegramMessage(chatId, text, parseMode) {
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