import { Switch, Route } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";

// Seiten importieren
import LoginPage from "@/pages/login";
import ChatPage from "@/pages/chat";

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Switch>
        <Route path="/" component={LoginPage} />
        <Route path="/chat" component={ChatPage} />
        <Route>
          <LoginPage />
        </Route>
      </Switch>
      <Toaster />
    </QueryClientProvider>
  );
}