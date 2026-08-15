import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/getCurrentUser";
import { fetchTiktokOrders, normalizeTiktokOrders } from "@/lib/tiktok";

export async function GET() {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });
  }

  try {
    const rawOrders = await fetchTiktokOrders(currentUser.myId);
    const orders = normalizeTiktokOrders(rawOrders);
    return NextResponse.json({ orders });
  } catch (err) {
    console.error(err);
    // Không throw 500 để không làm hỏng tab Đơn hàng khi RioHub lỗi/timeout —
    // trả về mảng rỗng, đơn Shopee vẫn hiển thị bình thường.
    return NextResponse.json({ orders: [] });
  }
}
