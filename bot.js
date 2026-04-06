const express = require('express');
const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');
const cheerio = require('cheerio');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { Octokit } = require("@octokit/rest");

// --- إعداد الخادم الوهمي لكي تقبله منصة Render ---
const app = express();
app.get('/', (req, res) => res.send('🤖 البوت يعمل بنجاح!'));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`الخادم يعمل على المنفذ ${PORT}`));

// --- الإعدادات (سيتم جلبها من Render) ---
const config = {
    TG_TOKEN: process.env.TG_TOKEN, 
    GEMINI_KEY: process.env.GEMINI_KEY,
    GH_TOKEN: process.env.GH_TOKEN,
    ADMIN_ID: 8294538151, // معرفك
    GITHUB_OWNER: 'thumb43',
    GITHUB_REPO: 'siteapp'
};

const bot = new Telegraf(config.TG_TOKEN);
const genAI = new GoogleGenerativeAI(config.GEMINI_KEY);
const octokit = new Octokit({ auth: config.GH_TOKEN });

// حماية البوت
bot.use((ctx, next) => {
    if (ctx.from && ctx.from.id === config.ADMIN_ID) return next();
    ctx.reply("⛔ هذا البوت للإدارة فقط.");
});

// أوامر لوحة التحكم
bot.start((ctx) => {
    ctx.reply(`👑 أهلاً بك في لوحة تحكم موقعك!\n\n/fetch - لجلب أحدث التطبيقات\n/status - لمعرفة حالة النظام`);
});

bot.command('status', (ctx) => ctx.reply("✅ النظام متصل ويعمل بكفاءة عالية على الخادم."));

bot.command('fetch', async (ctx) => {
    ctx.reply("⏳ جاري البحث عن تطبيقات جديدة...");
    try {
        const response = await axios.get('https://traidmod.org/');
        const $ = cheerio.load(response.data);
        const appName = $('.entry-title').first().text().trim();
        const appLink = $('.entry-title a').first().attr('href');
        const appImg = $('.wp-post-image').first().attr('src');

        ctx.reply("🤖 جاري صياغة الوصف التسويقي عبر الذكاء الاصطناعي...");
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const aiResponse = await model.generateContent(`اكتب وصفاً تسويقياً واحترافياً لتطبيق: ${appName} باللغة العربية.`);
        const aiDesc = aiResponse.response.text();

        await ctx.replyWithPhoto(appImg, {
            caption: `📦 **تطبيق جديد!**\n\n📌 **الاسم:** ${appName}\n📝 **الوصف:**\n${aiDesc.substring(0, 150)}...\n\n**ماذا أفعل؟**`,
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [Markup.button.callback('✅ انشر في الموقع', `pub|${appName}`)],
                [Markup.button.callback('❌ تجاهل', 'rej')]
            ])
        });

        bot.context.tempApp = { name: appName, description: aiDesc, image: appImg, link: appLink };
    } catch (err) {
        ctx.reply(`❌ خطأ: ${err.message}`);
    }
});

// أزرار التحكم
bot.action(/pub\|(.+)/, async (ctx) => {
    const appName = ctx.match[1];
    await ctx.answerCbQuery();
    await ctx.editMessageCaption(`⏳ جاري رفع **${appName}** وتحديث الموقع...`);

    try {
        let db = [];
        let sha = null;
        try {
            const { data } = await octokit.repos.getContent({
                owner: config.GITHUB_OWNER, repo: config.GITHUB_REPO, path: 'data.json'
            });
            db = JSON.parse(Buffer.from(data.content, 'base64').toString());
            sha = data.sha;
        } catch (e) { }

        db.unshift(ctx.tempApp);

        await octokit.repos.createOrUpdateFileContents({
            owner: config.GITHUB_OWNER, repo: config.GITHUB_REPO, path: 'data.json',
            message: `🤖 إضافة: ${appName}`,
            content: Buffer.from(JSON.stringify(db, null, 2)).toString('base64'),
            sha: sha
        });

        await ctx.editMessageCaption(`✅ **تم النشر!**\nسيظهر ${appName} في موقعك خلال ثوانٍ.`);
    } catch (err) {
        await ctx.editMessageCaption(`❌ فشل النشر: ${err.message}`);
    }
});

bot.action('rej', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.editMessageCaption("🗑️ تم التجاهل.");
});

bot.launch().then(() => console.log("🤖 البوت يعمل الآن..."));
