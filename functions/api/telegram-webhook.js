// Telegram webhook handler. Receives callback_query from inline buttons.
// Supported callback data:
//   approve:<pr_number>  → squash-merge the PR (production auto-deploys)
//
// Environment (CF Pages → Settings → Environment variables):
//   GITHUB_TOKEN        Fine-grained PAT, scope: Tektongrowth/blue-collar-techy,
//                       permissions: Contents:Write, Pull requests:Write
//   TELEGRAM_BOT_TOKEN  Bot token (same as the cron notifier)
//   TELEGRAM_CHAT_ID    Nick's chat ID — used as an authz filter

const REPO = "Tektongrowth/blue-collar-techy";

export async function onRequestPost({ request, env }) {
  let update;
  try {
    update = await request.json();
  } catch {
    return new Response("bad json", { status: 400 });
  }

  const cb = update.callback_query;
  if (!cb) return new Response("ok"); // ignore non-button updates

  const fromId = String(cb.from?.id || "");
  const chatId = String(cb.message?.chat?.id || "");
  const allowed = String(env.TELEGRAM_CHAT_ID || "");

  // Authz: only Nick can act
  if (fromId !== allowed && chatId !== allowed) {
    await answerCallback(env, cb.id, "Not authorized.");
    return new Response("forbidden", { status: 403 });
  }

  const data = String(cb.data || "");
  const [action, arg] = data.split(":");

  try {
    if (action === "approve") {
      const prNum = parseInt(arg, 10);
      if (!prNum) throw new Error("bad pr number");
      await approvePr(env, prNum, cb);
    } else {
      await answerCallback(env, cb.id, "Unknown action.");
    }
  } catch (err) {
    await answerCallback(env, cb.id, `Error: ${err.message}`);
    await sendMessage(env, chatId, `❌ Action failed: ${err.message}`);
    return new Response("error", { status: 500 });
  }

  return new Response("ok");
}

async function approvePr(env, prNum, cb) {
  // 1. Merge the PR (squash, delete branch)
  const mergeRes = await fetch(`https://api.github.com/repos/${REPO}/pulls/${prNum}/merge`, {
    method: "PUT",
    headers: ghHeaders(env),
    body: JSON.stringify({ merge_method: "squash" }),
  });

  if (!mergeRes.ok) {
    const body = await mergeRes.text();
    throw new Error(`GitHub merge ${mergeRes.status}: ${body.slice(0, 200)}`);
  }

  // 2. Get PR details to find the branch (so we can delete it)
  const prRes = await fetch(`https://api.github.com/repos/${REPO}/pulls/${prNum}`, {
    headers: ghHeaders(env),
  });
  if (prRes.ok) {
    const pr = await prRes.json();
    const branch = pr.head?.ref;
    if (branch && branch.startsWith("draft/")) {
      await fetch(`https://api.github.com/repos/${REPO}/git/refs/heads/${branch}`, {
        method: "DELETE",
        headers: ghHeaders(env),
      });
    }
  }

  // 3. Acknowledge in Telegram (update the message + send confirmation)
  await answerCallback(env, cb.id, "Merged. Deploying to production.");
  const chatId = String(cb.message?.chat?.id || "");
  const origText = cb.message?.text || "";
  await editMessage(
    env,
    chatId,
    cb.message.message_id,
    `${origText}\n\n✅ Approved & merged. Production deploy in progress.`
  );
}

function ghHeaders(env) {
  return {
    "Authorization": `Bearer ${env.GITHUB_TOKEN}`,
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "bct-telegram-webhook",
    "Content-Type": "application/json",
  };
}

async function answerCallback(env, callbackId, text) {
  return fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callback_query_id: callbackId, text }),
  });
}

async function sendMessage(env, chatId, text) {
  return fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
}

async function editMessage(env, chatId, messageId, text) {
  return fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/editMessageText`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      message_id: messageId,
      text,
      reply_markup: { inline_keyboard: [] },
    }),
  });
}

export async function onRequestGet() {
  return new Response("bct telegram webhook: POST only");
}
