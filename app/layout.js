export const metadata = {
  title: "Café T's Place - PDB · Biljartreserveringen",
  description: "Reserveer de Wit of Zwart biljarttafel bij Café T's Place.",
  manifest: "/manifest.json",
  themeColor: "#1B4332",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "T's Place",
  },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="nl">
      <head>
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,600;0,9..144,700;1,9..144,500&family=Inter:wght@400;500;600&display=swap"
        />
      </head>
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  );
}
