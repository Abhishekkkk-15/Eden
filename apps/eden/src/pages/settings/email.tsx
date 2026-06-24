import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { 
  Mail, 
  Send, 
  ShieldCheck, 
  Server, 
  Key, 
  ChevronLeft,
  Loader2,
  CheckCircle2,
  Settings2
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export default function EmailSettings() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [provider, setProvider] = useState<"resend" | "smtp">("resend");

  // Fetch current settings
  const { data: settings, isLoading } = useQuery({
    queryKey: ["email-settings"],
    queryFn: async () => {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/settings/email", {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error("Failed to fetch settings");
      return res.json();
    }
  });

  const [form, setForm] = useState({
    resendApiKey: "",
    smtpHost: "",
    smtpPort: 587,
    smtpUser: "",
    smtpPass: "",
    smtpFrom: "",
  });

  useEffect(() => {
    if (settings) {
      setProvider(settings.provider);
      setForm({
        resendApiKey: settings.resendApiKey || "",
        smtpHost: settings.smtpHost || "",
        smtpPort: settings.smtpPort || 587,
        smtpUser: settings.smtpUser || "",
        smtpPass: settings.smtpPass || "",
        smtpFrom: settings.smtpFrom || "",
      });
    }
  }, [settings]);

  const updateMutation = useMutation({
    mutationFn: async (data: any) => {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/settings/email", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify(data)
      });
      if (!res.ok) throw new Error("Failed to update settings");
      return res.json();
    },
    onSuccess: () => {
      toast.success("Email settings updated successfully");
      queryClient.invalidateQueries({ queryKey: ["email-settings"] });
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to update settings");
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate({ provider, ...form });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-full p-6 md:p-8 max-w-4xl mx-auto space-y-10">
      {/* Header */}
      <div className="flex items-center gap-4 pt-6">
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={() => setLocation("/settings/integrations")}
          className="rounded-full"
        >
          <ChevronLeft className="w-5 h-5" />
        </Button>
        <div className="space-y-0.5">
          <h1 className="text-2xl font-bold tracking-tight">Email Integration</h1>
          <p className="text-sm text-muted-foreground">
            Configure how Eden sends notifications and reports.
          </p>
        </div>
      </div>

      <Separator />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Provider Selection */}
        <div className="space-y-6">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4">Choose Provider</h2>
            <RadioGroup 
              value={provider} 
              onValueChange={(val) => setProvider(val as any)}
              className="grid gap-4"
            >
              <Label
                htmlFor="resend"
                className={`flex items-center justify-between p-4 rounded-xl border-2 cursor-pointer transition-all ${provider === "resend" ? "border-primary bg-primary/5" : "border-border hover:border-border/80"}`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-black flex items-center justify-center">
                    <Send className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="font-bold">Resend</p>
                    <p className="text-xs text-muted-foreground">Fast, modern API</p>
                  </div>
                </div>
                <RadioGroupItem value="resend" id="resend" className="sr-only" />
                {provider === "resend" && <CheckCircle2 className="w-5 h-5 text-primary" />}
              </Label>

              <Label
                htmlFor="smtp"
                className={`flex items-center justify-between p-4 rounded-xl border-2 cursor-pointer transition-all ${provider === "smtp" ? "border-primary bg-primary/5" : "border-border hover:border-border/80"}`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                    <Server className="w-5 h-5 text-foreground" />
                  </div>
                  <div>
                    <p className="font-bold">Custom SMTP</p>
                    <p className="text-xs text-muted-foreground">Gmail, Outlook, etc.</p>
                  </div>
                </div>
                <RadioGroupItem value="smtp" id="smtp" className="sr-only" />
                {provider === "smtp" && <CheckCircle2 className="w-5 h-5 text-primary" />}
              </Label>
            </RadioGroup>
          </div>

          <Card className="bg-muted/30 border-none">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-primary" />
                Privacy Note
              </CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription className="text-xs leading-relaxed">
                Your credentials are encrypted and stored securely. We only use them to send notifications triggered by your workflows.
              </CardDescription>
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Configuration Form */}
        <div className="lg:col-span-2">
          <form onSubmit={handleSubmit} className="space-y-6">
            <Card className="border-border/50 shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings2 className="w-5 h-5" />
                  {provider === "resend" ? "Resend Configuration" : "SMTP Configuration"}
                </CardTitle>
                <CardDescription>
                  {provider === "resend" 
                    ? "Enter your Resend API key to start sending emails." 
                    : "Configure your outgoing mail server details."}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {provider === "resend" ? (
                  <div className="space-y-2">
                    <Label htmlFor="apiKey" className="flex items-center gap-2">
                      <Key className="w-3.5 h-3.5" />
                      API Key
                    </Label>
                    <Input 
                      id="apiKey"
                      type="password"
                      placeholder="re_..."
                      value={form.resendApiKey}
                      onChange={(e) => setForm({ ...form, resendApiKey: e.target.value })}
                    />
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="host">SMTP Host</Label>
                      <Input 
                        id="host"
                        placeholder="smtp.example.com"
                        value={form.smtpHost}
                        onChange={(e) => setForm({ ...form, smtpHost: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="port">Port</Label>
                      <Input 
                        id="port"
                        type="number"
                        placeholder="587"
                        value={form.smtpPort}
                        onChange={(e) => setForm({ ...form, smtpPort: parseInt(e.target.value) })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="user">Username</Label>
                      <Input 
                        id="user"
                        placeholder="user@example.com"
                        value={form.smtpUser}
                        onChange={(e) => setForm({ ...form, smtpUser: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="pass">Password</Label>
                      <Input 
                        id="pass"
                        type="password"
                        placeholder="••••••••"
                        value={form.smtpPass}
                        onChange={(e) => setForm({ ...form, smtpPass: e.target.value })}
                      />
                    </div>
                  </div>
                )}

                <div className="pt-4 border-t border-border/50 mt-4 space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="from" className="flex items-center gap-2">
                      <Mail className="w-3.5 h-3.5" />
                      Sender Email (From)
                    </Label>
                    <Input 
                      id="from"
                      type="email"
                      placeholder="Eden <notifications@yourdomain.com>"
                      value={form.smtpFrom}
                      onChange={(e) => setForm({ ...form, smtpFrom: e.target.value })}
                    />
                    <p className="text-[10px] text-muted-foreground italic">
                      {provider === "resend" 
                        ? "Must be a verified domain/email in your Resend dashboard."
                        : "Recommended to match your SMTP username."}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-end gap-3">
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => setLocation("/settings/integrations")}
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={updateMutation.isPending}
                className="gap-2 px-8"
              >
                {updateMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                Save Settings
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
