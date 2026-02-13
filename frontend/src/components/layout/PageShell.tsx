import Navbar from "./Navbar";
import Footer from "./Footer";

interface PageShellProps {
  children: React.ReactNode;
  hideFooter?: boolean;
}

const PageShell: React.FC<PageShellProps> = ({ children, hideFooter }) => (
  <div className="flex min-h-screen flex-col">
    <Navbar />
    <main className="flex-1">{children}</main>
    {!hideFooter && <Footer />}
  </div>
);

export default PageShell;
