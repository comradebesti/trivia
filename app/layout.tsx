import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Team Trivia",
  description: "A live team trivia game for your next event.",
  icons: { icon: "/flavicon.png?v=20261007-1111" }
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
