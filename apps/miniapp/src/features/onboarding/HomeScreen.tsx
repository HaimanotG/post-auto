import { ConnectFacebookButton } from "./ConnectFacebookButton";
import { OAuthStatusPoller } from "./OAuthStatusPoller";

/** Landing screen: connect the business's Facebook/Instagram account, and surface the OAuth round-trip's result on relaunch. */
export function HomeScreen() {
  return (
    <div>
      <h1 className="text-xl font-semibold">PostAuto</h1>
      <ConnectFacebookButton />
      <OAuthStatusPoller />
    </div>
  );
}
