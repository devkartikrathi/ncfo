"use client";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import useFetch from "@/hooks/use-fetch";
import { createTransactionFromPrompt } from "@/actions/transaction";
import { Loader2, Send } from "lucide-react";

const EXAMPLES = [
  "Spent ₹500 on lunch",
  "Received ₹45,000 salary",
  "₹2,500 for electricity"
];

export function TransactionPromptInput({ onSuccess }) {
  const [value, setValue] = useState("");
  const { loading, fn: submitPrompt } = useFetch(async (prompt) => {
    const res = await createTransactionFromPrompt(prompt);
    if (res.success) {
      toast.success("Transaction added!");
      setValue("");
      if (onSuccess) onSuccess();
    } else {
      toast.error(res.error || "Failed to add transaction");
    }
  });

  const handleExample = (ex) => setValue(ex);
  const handleSubmit = (e) => {
    e.preventDefault();
    if (!value.trim()) return;
    submitPrompt(value);
  };

  return (
    <Card className="p-6 mb-8">
      <div className="mb-2 text-xl font-semibold">What did you spend or earn?</div>
      <div className="mb-2 text-muted-foreground text-sm">Examples:</div>
      <div className="flex gap-2 mb-4 flex-wrap">
        {EXAMPLES.map((ex) => (
          <button
            key={ex}
            type="button"
            className="bg-blue-50 text-blue-700 px-3 py-1 rounded-full text-xs hover:bg-blue-100 border border-blue-100"
            onClick={() => handleExample(ex)}
          >
            {ex}
          </button>
        ))}
      </div>
      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        <Input
          className="flex-1"
          placeholder="Type your transaction here..."
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={loading}
        />
        <Button type="submit" disabled={loading || !value.trim()} size="icon">
          {loading ? <Loader2 className="animate-spin" /> : <Send />}
        </Button>
      </form>
    </Card>
  );
} 