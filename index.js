const Telegraf = require('telegraf');
const redis = require('redis');
const cron = require('node-cron');
const axios = require('axios');
require('dotenv').config();

const client = redis.createClient(process.env.REDIS_URL);
const broadcast = redis.createClient(process.env.REDIS_URL);
const STATUS_ACTIVE = 1;

const subscribe = ctx => {
    const id = ctx.message.chat.id;
    let isSubscribe = null;
    client.hget('covidxix', id, (err, resp) => {
        isSubscribe = resp;
    })
    if (isSubscribe) return;
    client.hsetnx('covidxix', id, STATUS_ACTIVE, (err, resp) => {
        if (err) console.log(err);
        ctx.reply('Subscribe success');
    })
}

const bot = new Telegraf(process.env.BOT_TOKEN);
bot.start((ctx) => ctx.reply('Hi, Nice to meet you..'));
bot.command('subscribe', ctx => {
    subscribe(ctx);
});

const getContentApi = async () => {
    let response = await axios.get(process.env.COVID_COUNTER_URL);
    let summary = response.data;
    let content = Buffer.from(JSON.stringify(summary), 'binary').toString('base64');
    client.get('covidxix:content', (err, res) => {
        if (err) return;
        if (res == content) return;
        client.set('covidxix:content', content);
        client.publish('covidxix:update', JSON.stringify(summary));
    });
}

cron.schedule('* * * * *', () => {
    console.log(`Starting cron jobs in ${new Date().getTime()}`);
    try {
        getContentApi();
    } catch(err) {
        console.log(`Failed attempt to do cron scheduled because ${err}`);
    }
});

broadcast.on('message', function(channel, message) {
    console.log(`broadcasting event from channel ${channel} with message ${message}`)
    client.hkeys('covidxix', (err, subscribers) => {
        if (!subscribers) return;
        if (subscribers.length <= 0) return;
        subscribers.forEach(subscriber => {
            bot.telegram.sendMessage(subscriber, message);
        });
    });
});

broadcast.subscribe('covidxix:update');

bot.launch();