import { NextResponse } from "next/server";
import { verifySessionToken, SESSION_COOKIE_NAME } from "@/lib/auth";

// Lưu ý: /admin KHÔNG được chặn ở đây — trang app/admin/page.js (server
// component) tự kiểm tra cookie admin_session và tự hiện ô nhập mật khẩu
// ngay tại chỗ nếu chưa đăng nhập, để chỉ có đúng 1 trang /admin duy nhất
// (không có route /admin/login riêng).

// Domain "chính chủ" duy nhất mà khách nên luôn dùng — set biến môi trường
// CANONICAL_HOST (vd: "meozz-hoantien.vercel.app" hoặc domain riêng, KHÔNG có
// https://) trên Vercel cho MỌI environment (Production lẫn Preview).
//
// Lý do cần cái này: cookie đăng nhập (session) KHÔNG gắn domain, chỉ có hiệu
// lực đúng trên host đã set nó. Nếu khách lỡ mở link deploy cũ/preview (dạng
// project-<hash>.vercel.app) thay vì domain chính, họ đăng nhập xong vẫn bị
// đá về /login vì cookie không "theo" sang host khác. Redirect ở đây đảm bảo
// dù khách bấm vào bất kỳ link deploy nào của dự án, họ luôn được đưa về đúng
// MỘT domain — nên cookie luôn nhất quán, đăng nhập ở đâu cũng vào được.
const CANONICAL_HOST = process.env.CANONICAL_HOST || "";

export async function proxy(request) {
  const { pathname, search } = request.nextUrl;
  const currentHost = request.headers.get("host") || "";

  if (CANONICAL_HOST && currentHost && currentHost !== CANONICAL_HOST) {
    const canonicalUrl = new URL(`https://${CANONICAL_HOST}${pathname}${search}`);
    return NextResponse.redirect(canonicalUrl, 308);
  }

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const payload = token ? await verifySessionToken(token) : null;

  if (pathname.startsWith("/dashboard") && !payload) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  if (pathname === "/login" && payload) {
    const dashboardUrl = new URL("/dashboard", request.url);
    return NextResponse.redirect(dashboardUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/dashboard/:path*", "/login"],
};
