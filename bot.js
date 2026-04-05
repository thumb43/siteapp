const axios = require('axios');
const cheerio = require('cheerio');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require('fs');

// الإعدادات من GitHub Secrets
const config = {
    TG_TOKEN: process.env.TG_TOKEN,
    GEMINI_KEY: process.env.GEMINI_KEY,
    ADMIN_ID: "8294538151"
};

async function startSystem() {
    try {
        console.log("🔍 جاري فحص المواقع...");
        const response = await axios.get('https://traidmod.org/');
        const $ = cheerio.load(response.data);
        
        const appName = $('.entry-title').first().text().trim();
        const appLink = $('.entry-title a').first().attr('href');
        const appImg = $('.wp-post-image').first().attr('src');

        // 1. إعادة صياغة بالذكاء الاصطناعي
        const genAI = new GoogleGenerativeAI(config.GEMINI_KEY);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const prompt = `اكتب وصفاً تقنياً احترافياً ومختصراً باللغة العربية لتطبيق: ${appName}. اجعل الأسلوب فخماً وحصرياً لموقع تحميل ألعاب.`;
        const result = await model.generateContent(prompt);
        const aiDesc = result.response.text();

        // 2. تحديث قاعدة البيانات المحلية (data.json)
        let db = [];
        if (fs.existsSync('data.json')) {
            db = JSON.parse(fs.readFileSync('data.json'));
        }
        
        // التحقق من عدم التكرار
        if (!db.some(a => a.name === appName)) {
            const newApp = { name: appName, description: aiDesc, image: appImg, link: appLink };
            db.unshift(newApp);
            fs.writeFileSync('data.json', JSON.stringify(db.slice(0, 50), null, 2));

            // 3. إرسال تنبيه فوري لتلجرام
            const msg = `✅ **تم إضافة تطبيق جديد للموقع!**\n\n🔹 **الاسم:** ${appName}\n🔹 **الوصف:** ${aiDesc.substring(0, 100)}...\n\nتم التحديث تلقائياً على GitHub Pages.`;
            await axios.post(`https://api.telegram.org/bot${config.TG_TOKEN}/sendPhoto`, {
                chat_id: config.ADMIN_ID,
                photo: appImg,
                caption: msg,
                parse_mode: 'Markdown'
            });
            console.log("🚀 تم التحديث وإرسال التنبيه!");
        } else {
            console.log("ℹ️ لا توجد تطبيقات جديدة حالياً.");
        }
    } catch (err) {
        console.error("❌ خطأ في النظام:", err.message);
    }
}

startSystem();
