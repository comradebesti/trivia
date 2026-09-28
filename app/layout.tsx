import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Halloween Trivia",
  description: "A live team trivia game for Halloween.",
  icons: { icon: "/favicon.svg" }
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
