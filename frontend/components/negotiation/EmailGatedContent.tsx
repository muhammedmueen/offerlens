"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { negotiateOffer } from "@/lib/api";
import { Loader2, Mail, Lock } from "lucide-react";

interface EmailGatedContentProps {
    offerId: string;
    title?: string;
    description?: string;
    onSuccess?: () => void;
}

export function EmailGatedContent({
    offerId,
    title = "Unlock Your Negotiation Script",
    description = "Get a personalized negotiation script based on your offer analysis sent to your inbox.",
    onSuccess
}: EmailGatedContentProps) {
    const [email, setEmail] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [isSuccess, setIsSuccess] = useState(false);
    const { toast } = useToast();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            toast({
                title: "Invalid Email",
                description: "Please enter a valid email address.",
                variant: "destructive",
            });
            return;
        }

        setIsLoading(true);

        try {
            await negotiateOffer(offerId, email);
            setIsSuccess(true);
            toast({
                title: "Script Sent!",
                description: "Check your inbox for your personalized negotiation strategy.",
            });
            if (onSuccess) onSuccess();
        } catch (error) {
            toast({
                title: "Error",
                description: error instanceof Error ? error.message : "Failed to send email. Please try again.",
                variant: "destructive",
            });
        } finally {
            setIsLoading(false);
        }
    };

    if (isSuccess) {
        return (
            <div className="bg-green-50 border border-green-100 rounded-lg p-8 text-center">
                <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Mail className="h-6 w-6 text-green-600" />
                </div>
                <h3 className="text-xl font-semibold text-green-800 mb-2">Check Your Inbox!</h3>
                <p className="text-green-600 mb-4">
                    We've sent the negotiation script to <strong>{email}</strong>.
                </p>
                <Button variant="outline" onClick={() => setIsSuccess(false)} className="text-green-700 border-green-200 hover:bg-green-100">
                    Send to another email
                </Button>
            </div>
        );
    }

    return (
        <div className="relative overflow-hidden rounded-xl border bg-background shadow-sm">
            <div className="p-6 md:p-8">
                <div className="flex flex-col items-center text-center space-y-4 max-w-md mx-auto">
                    <div className="p-3 bg-primary/10 rounded-full">
                        <Lock className="h-6 w-6 text-primary" />
                    </div>

                    <div className="space-y-2">
                        <h3 className="text-2xl font-bold tracking-tight">{title}</h3>
                        <p className="text-muted-foreground">{description}</p>
                    </div>

                    <form onSubmit={handleSubmit} className="w-full space-y-4 mt-4">
                        <div className="space-y-2">
                            <Input
                                type="email"
                                placeholder="Enter your email address"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                disabled={isLoading}
                                className="h-11"
                                required
                            />
                            <p className="text-xs text-muted-foreground text-left">
                                We'll only use this to send you the script. No spam.
                            </p>
                        </div>

                        <Button type="submit" className="w-full h-11 text-base font-medium transition-all" disabled={isLoading}>
                            {isLoading ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Sending...
                                </>
                            ) : (
                                "Get My Negotiation Script"
                            )}
                        </Button>
                    </form>
                </div>
            </div>

            {/* Decorative background elements */}
            <div className="absolute -top-12 -right-12 w-24 h-24 bg-primary/5 rounded-full blur-2xl" />
            <div className="absolute -bottom-12 -left-12 w-24 h-24 bg-primary/5 rounded-full blur-2xl" />
        </div>
    );
}
