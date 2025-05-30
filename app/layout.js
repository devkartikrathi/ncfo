import { ClerkProvider } from "@clerk/nextjs";
import { Inter } from "next/font/google";
import "./globals.css";
import Header from "@/components/header";
const inter = Inter({ subsets: ["latin"] });


export const metadata = {
  title: "Create Next App",
  description: "One stop finance app",
};

export default function RootLayout({ children }) {
  return (
    <ClerkProvider>
      <html lang="en">

        <body className={inter.className}>

          <Header />

          <main className="min-h-screen">
            {children}
          </main>

          <footer className="bg-blue-50 py-12">
            <div className="container mx-auto px-4 text-center text-gray-600">
              <p>
                &copy; 2025 One Stop Finance. All rights reserved.
              </p> 
            </div>
          </footer>

        </body>
      </html>
    </ClerkProvider>
  );
}
