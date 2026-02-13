import { Link } from "react-router-dom";

const Footer = () => (
  <footer className="border-t border-border bg-background py-8">
    <div className="container mx-auto flex flex-col items-center gap-4 px-4 text-center text-sm text-muted-foreground md:flex-row md:justify-between md:text-left">
      <p>&copy; {new Date().getFullYear()} OfferLens. All rights reserved.</p>
      <div className="flex gap-4">
        <Link to="/forum" className="hover:text-foreground transition-colors cursor-pointer">Forum</Link>
        <Link to="/salaries" className="hover:text-foreground transition-colors cursor-pointer">Salaries</Link>
        <Link to="/feature-requests" className="hover:text-foreground transition-colors cursor-pointer">Feedback</Link>
      </div>
    </div>
  </footer>
);

export default Footer;
