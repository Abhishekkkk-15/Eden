import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, Github, Mail, Chrome } from "lucide-react";
import { useGoogleLogin } from "@react-oauth/google";

export default function LoginPage() {
  const { login } = useAuth();
  const [, setLocation] = useLocation();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleGoogleLogin = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      console.log("[Login:Google] Token response received:", tokenResponse);
      setLoading(true);
      try {
        console.log("[Login:Google] Fetching user info...");
        const userInfo = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
          headers: { Authorization: `Bearer ${tokenResponse.access_token}` },
        }).then(res => res.json());
        
        console.log("[Login:Google] User info received:", userInfo);

        console.log("[Login:Google] Sending to backend...");
        const res = await fetch("/api/auth/google", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            email: userInfo.email,
            name: userInfo.name,
            picture: userInfo.picture,
            googleId: userInfo.sub
          }),
        });

        if (!res.ok) {
          const errorData = await res.json();
          throw new Error(errorData.error || "Google login failed");
        }

        const data = await res.json();
        console.log("[Login:Google] Backend success:", data);
        login(data.token, data.user);
        toast.success("Logged in with Google!");
        setLocation("/");
      } catch (err: any) {
        console.error("[Login:Google] Error:", err);
        toast.error(err.message);
      } finally {
        setLoading(false);
      }
    },
    onError: (error) => {
      console.error("[Login:Google] OAuth error:", error);
      toast.error("Google login failed");
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) throw new Error("Invalid credentials");

      const data = await res.json();
      console.log("[Login] Success response:", data);
      login(data.token, data.user);
      toast.success("Logged in successfully!");
      setLocation("/");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md border-none bg-card/50 shadow-2xl backdrop-blur-xl">
        <CardHeader className="space-y-1">
          <CardTitle className="text-3xl font-bold tracking-tight">Welcome back</CardTitle>
          <CardDescription>
            Enter your email to sign in to your workspace
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="m@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="bg-background/50"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="bg-background/50"
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Sign In"}
            </Button>
          </form>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">Or continue with</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Button variant="outline" className="w-full" onClick={() => handleGoogleLogin()} disabled={loading}>
              <Chrome className="mr-2 h-4 w-4" />
              Google
            </Button>
            <Button variant="outline" className="w-full" onClick={() => setLocation("/signup")}>
              <Mail className="mr-2 h-4 w-4" />
              Sign Up
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
