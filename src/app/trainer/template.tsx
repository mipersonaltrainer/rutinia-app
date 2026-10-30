// A template (unlike the layout) is re-created on every navigation, so each screen of the panel eases in again. The motion itself is CSS (globals.css).
export default function Template({ children }: { children: React.ReactNode }) { return <div className="page-in">{children}</div>; }
