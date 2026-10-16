import { Link } from "react-router-dom";

const Footer = () => (
  <footer className="border-t border-border bg-background py-8">
    <div className="container mx-auto flex flex-col items-center gap-4 px-4 text-center text-sm text-muted-foreground md:flex-row md:justify-between md:text-left">
      <p>&copy; {new Date().getFullYear()} OfferLens. All rights reserved.</p>
      <div className="flex flex-wrap items-center justify-center gap-4">
        <Link to="/forum" className="hover:text-foreground transition-colors cursor-pointer">Forum</Link>
        <Link to="/salaries" className="hover:text-foreground transition-colors cursor-pointer">Salaries</Link>
        <Link to="/feature-requests" className="hover:text-foreground transition-colors cursor-pointer">Feedback</Link>
        <a
          href="https://mueens.tech"
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-sm hover:text-foreground transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-700 focus-visible:ring-offset-2"
        >
          Built by Mueen · mueens.tech
        </a>
      </div>
    </div>
  </footer>
);

export default Footer;
