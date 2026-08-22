import { AuthPage, Protected } from "./pages/Auth";
import { ConsolePage, HealingConsolePage } from "./pages/Console";
import { OpportunityList } from "./pages/Discover";
import { Landing } from "./pages/Home";
import { LiveDemoPage } from "./pages/LiveDemoSection";
import {
  Deadlines,
  Detail,
  Preferences,
  Profile,
  Saved,
} from "./pages/Opportunities";

export function App() {
  const path = window.location.pathname.replace(/\/$/, "") || "/";

  if (path === "/login") return <AuthPage />;
  if (path === "/signup") return <AuthPage signup />;
  if (path === "/console/healing") return <HealingConsolePage />;
if (path === "/demo") return <LiveDemoPage />;
  if (path.startsWith("/console")) return <ConsolePage />;
  if (path === "/") return <Landing />;
  if (path.startsWith("/opportunities/") && path.split("/")[2]) {
    return <Detail id={path.split("/")[2]} />;
  }
  if (path === "/saved")
    return (
      <Protected>
        <Saved />
      </Protected>
    );
  if (path === "/deadlines") return <Deadlines />;
  if (path === "/preferences")
    return (
      <Protected>
        <Preferences />
      </Protected>
    );
  if (path === "/profile")
    return (
      <Protected>
        <Profile />
      </Protected>
    );

  return (
    <OpportunityList
      title={
        path === "/opportunities"
          ? "All opportunities"
          : "Discover opportunities"
      }
    />
  );
}
