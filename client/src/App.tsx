// client/src/App.tsx
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";

import WelcomePage from "./pages/welcome";
import ChatPage from "./pages/chat";
import FaqPage from "./pages/faq";
import ImprintPage from "./pages/imprint";
import PrivacyPolicyPage from "./pages/privacy-policy";

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Switch>
        <Route path="/" component={WelcomePage} />
        <Route path="/chat" component={ChatPage} />
        <Route path="/faq" component={FaqPage} />
        <Route path="/imprint" component={ImprintPage} />
        <Route path="/privacy-policy" component={PrivacyPolicyPage} />
        <Route>
          <WelcomePage />
        </Route>
      </Switch>

      <Toaster />
    </QueryClientProvider>
  );
}

export default App;
