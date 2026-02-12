import express from "express";
import axios from "axios";

const app = express();
app.use(express.json());

const TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;

const CATALOG = `🔥 عروض اشتراكات ChatGPT – اختر الباقة المناسبة إلك

مرحباً 👋✨  
إذا حابب تطوّر شغلك أو دراستك باستخدام ChatGPT، هاي العروض المتوفرة حالياً عنا 👇  

═══════════════════════  
🌟 ChatGPT Business (20 شيكل / شهر)
✔ محادثات جديدة بدون قيود
✔ يدعم وضع Pro
✔ صور بعدد كبير جداً (أكثر من البلس)

═══════════════════════  
⭐ ChatGPT Plus (30 شيكل / شهر) على إيميلك
📌 ملاحظة: للتفعيل لازم بيانات الدخول بشكل مؤقت (الإيميل + كلمة المرور)
✔ صور (قد تكون محدودة حسب الضغط)

═══════════════════════  
💎 حساب Plus جاهز من عنا (15 شيكل)
✔ إيميل + باسورد جاهزين
`;

async function sendText(to, text) {
  await axios.post(
    `https://graph.facebook.com/v22.0/${PHONE_NUMBER_ID}/messages`,
    { messaging_product: "whatsapp", to, type: "text", text: { body: text } },
    { headers: { Authorization: `Bearer ${TOKEN}` } }
  );
}

async function sendButtons(to, bodyText, buttons) {
  await axios.post(
    `https://graph.facebook.com/v22.0/${PHONE_NUMBER_ID}/messages`,
    {
      messaging_product: "whatsapp",
      to,
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: bodyText },
        action: {
          buttons: buttons.map(b => ({
            type: "reply",
            reply: { id: b.id, title: b.title }
          }))
        }
      }
    },
    { headers: { Authorization: `Bearer ${TOKEN}` } }
  );
}

const mainMenu = (to) =>
  sendButtons(to, "أهلاً في Aqib Digital Store 👋✨\nكيف فينا نساعدك اليوم؟", [
    { id: "MENU_DETAILS", title: "📌 تفاصيل الاشتراك" },
    { id: "MENU_SUPPORT", title: "🛠️ التحدث مع الدعم" }
  ]);

const planMenu = (to) =>
  sendButtons(to, "✅ أي نوع حابب تشترك فيه؟", [
    { id: "PLAN_BUSINESS", title: "🔥 Business – 20" },
    { id: "PLAN_PLUS_EMAIL", title: "⭐ Plus – 30" },
    { id: "PLAN_PLUS_READY", title: "💎 Plus جاهز – 15" }
  ]);

app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode === "subscribe" && token === VERIFY_TOKEN) return res.status(200).send(challenge);
  return res.sendStatus(403);
});

app.post("/webhook", async (req, res) => {
  try {
    const msg = req.body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!msg) return res.sendStatus(200);

    const from = msg.from;

    if (msg.type === "interactive" && msg.interactive?.type === "button_reply") {
      const id = msg.interactive.button_reply.id;

      if (id === "MENU_DETAILS") {
        await sendText(from, CATALOG);
        await planMenu(from);
      } else if (id === "MENU_SUPPORT") {
        await sendText(from, "شكراً لك ✅\nسوف يتم تحويلك إلى الدعم الفني الآن.");
      } else if (id === "PLAN_BUSINESS") {
        await sendText(from, "ممتاز 🔥\nابعث الإيميل اللي بدك نفعّل عليه اشتراك Business (20 شيكل / شهر).");
      } else if (id === "PLAN_PLUS_EMAIL") {
        await sendText(from, "ممتاز ⭐\nابعث بيانات الدخول مؤقتاً للتفعيل (الإيميل + كلمة المرور).");
      } else if (id === "PLAN_PLUS_READY") {
        await sendText(from, "💎 تمام!\nهذا حساب Plus جاهز من عنا (15 شيكل).\nابعث (جاهز) وبنبعت تفاصيل الدفع.");
      } else {
        await mainMenu(from);
      }

      return res.sendStatus(200);
    }

    // أي رسالة نصية => اعرض القائمة
    if (msg.type === "text") {
      await mainMenu(from);
      return res.sendStatus(200);
    }

    await mainMenu(from);
    return res.sendStatus(200);
  } catch (e) {
    console.log("ERR:", e?.response?.data || e.message);
    return res.sendStatus(200);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Running on", PORT));
