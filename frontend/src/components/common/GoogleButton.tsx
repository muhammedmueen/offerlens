import { useGoogleLogin } from "@react-oauth/google";
import { Button } from "@/components/ui/button";

interface GoogleButtonProps {
  label: string;
  onToken: (accessToken: string) => void;
  onError: () => void;
}

// Its own component so useGoogleLogin only runs when rendered: Google's script throws on an empty
// client id, so callers must render this only when VITE_GOOGLE_CLIENT_ID is set.
const GoogleButton: React.FC<GoogleButtonProps> = ({ label, onToken, onError }) => {
  const googleLogin = useGoogleLogin({
    onSuccess: (tokenResponse) => onToken(tokenResponse.access_token),
    onError,
  });

  return (
    <Button variant="outline" className="w-full cursor-pointer rounded-md" onClick={() => googleLogin()}>
      {label}
    </Button>
  );
};

export default GoogleButton;
