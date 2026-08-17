// Phát hiện trình duyệt "trong app" (in-app browser / WebView) — Zalo, Messenger,
// Instagram, Line, TikTok, WeChat... Các WebView này đôi khi KHÔNG lưu cookie
// bền vững giữa các lần điều hướng (đặc biệt trên iOS), khiến người dùng đăng
// nhập xong bị "đá" ngược lại /login dù server đã set cookie thành công.
//
// Không có cách nào từ JS bắt buộc các WebView này lưu cookie đúng cách — giải
// pháp thực tế duy nhất là phát hiện và hướng dẫn khách mở bằng trình duyệt
// thật (Safari/Chrome/Cốc Cốc...).

const IN_APP_BROWSER_PATTERNS = [
  /Zalo/i,
  /FBAN|FBAV|FB_IAB|FBIOS/i, // Facebook / Messenger
  /Instagram/i,
  /Line\//i,
  /MicroMessenger/i, // WeChat
  /TikTok/i,
  /BytedanceWebview/i,
];

export function isEmbeddedWebview(userAgent) {
  if (!userAgent) return false;
  return IN_APP_BROWSER_PATTERNS.some((re) => re.test(userAgent));
}

/** Tên gợi nhớ của app (để hiển thị lời nhắc "Bạn đang mở bằng trình duyệt của Zalo..."). */
export function detectHostAppName(userAgent) {
  if (!userAgent) return "";
  if (/Zalo/i.test(userAgent)) return "Zalo";
  if (/FBAN|FBAV|FB_IAB|FBIOS/i.test(userAgent)) return "Facebook/Messenger";
  if (/Instagram/i.test(userAgent)) return "Instagram";
  if (/Line\//i.test(userAgent)) return "Line";
  if (/MicroMessenger/i.test(userAgent)) return "WeChat";
  if (/TikTok|BytedanceWebview/i.test(userAgent)) return "TikTok";
  return "app này";
}

/** Android hỗ trợ intent:// để bật thẳng Chrome; iOS thì không có cách ép mở Safari từ JS. */
export function isAndroidUserAgent(userAgent) {
  return !!userAgent && /Android/i.test(userAgent);
}

/** Build link "intent://" mở thẳng Chrome trên Android, fallback về URL gốc nếu không hỗ trợ. */
export function buildAndroidChromeIntentUrl(currentUrl) {
  try {
    const u = new URL(currentUrl);
    const rest = `${u.host}${u.pathname}${u.search}`;
    return `intent://${rest}#Intent;scheme=${u.protocol.replace(":", "")};package=com.android.chrome;end`;
  } catch {
    return currentUrl;
  }
}
