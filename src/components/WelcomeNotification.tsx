import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { BookOpen, Sparkles, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const WELCOME_DISMISSED_KEY = "welcome_notification_dismissed";

interface WelcomeNotificationProps {
  onOpenGuides: () => void;
}

const WelcomeNotification = ({ onOpenGuides }: WelcomeNotificationProps) => {
  const [visible, setVisible] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(false);

  useEffect(() => {
    const dismissed = localStorage.getItem(WELCOME_DISMISSED_KEY);
    if (dismissed !== "true") {
      // Small delay for entrance animation
      const timer = setTimeout(() => setVisible(true), 500);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleClose = () => {
    if (dontShowAgain) {
      localStorage.setItem(WELCOME_DISMISSED_KEY, "true");
    }
    setVisible(false);
  };

  const handleOpenGuides = () => {
    onOpenGuides();
    handleClose();
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: -20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -20, scale: 0.95 }}
          transition={{ type: "spring", stiffness: 300, damping: 25 }}
          className="relative overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/5 via-background to-accent/10 p-5 md:p-6 mb-4 md:mb-6 shadow-lg shadow-primary/5"
        >
          {/* Decorative background elements */}
          <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full -translate-y-1/2 translate-x-1/2 blur-2xl" />
          <div className="absolute bottom-0 left-0 w-24 h-24 bg-accent/10 rounded-full translate-y-1/2 -translate-x-1/2 blur-xl" />

          <div className="relative z-10">
            {/* Header */}
            <div className="flex items-start gap-4 mb-4">
              <div className="shrink-0 w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center shadow-md shadow-primary/20">
                <Sparkles className="w-6 h-6 text-primary-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-lg font-bold text-foreground mb-1">
                  Chào mừng bạn! 👋
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Nếu bạn là người mới, có thể xem hướng dẫn sử dụng các chức năng của web để sử dụng hiệu quả hơn.
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleClose}
                className="shrink-0 w-8 h-8 rounded-full hover:bg-muted"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>

            {/* Guide Button */}
            <Button
              onClick={handleOpenGuides}
              className="w-full sm:w-auto btn-primary-gradient py-5 px-6 text-base font-semibold shadow-md shadow-primary/20 hover:shadow-lg hover:shadow-primary/30 transition-all duration-300 group"
            >
              <BookOpen className="w-5 h-5 mr-2 group-hover:rotate-12 transition-transform" />
              Xem Hướng Dẫn
            </Button>

            {/* Footer */}
            <div className="flex items-center justify-between mt-4 pt-3 border-t border-border/50">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <Checkbox
                  checked={dontShowAgain}
                  onCheckedChange={(checked) => setDontShowAgain(!!checked)}
                  className="data-[state=checked]:bg-primary"
                />
                <span className="text-xs text-muted-foreground">Không hiển thị lại</span>
              </label>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClose}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Đóng
              </Button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default WelcomeNotification;
