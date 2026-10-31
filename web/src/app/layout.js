import './globals.css';

export const metadata = {
  title: 'IronStallions',
  description: 'Gym Management and Fitness Tracking System',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
