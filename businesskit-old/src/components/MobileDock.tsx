import { component$, useSignal, useVisibleTask$, Slot } from "@builder.io/qwik";

interface MobileDockProps {
  class?: string;
}

export const MobileDock = component$<MobileDockProps>((props) => {
  const isHidden = useSignal(false);
  const lastScrollY = useSignal(0);

  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(() => {
    // 1. Android 3-button navigation bar detection
    const updateNavDetection = () => {
      const isAndroid = /Android/i.test(navigator.userAgent);
      if (isAndroid) {
        // On Android with 3 buttons, screen.height - innerHeight is >= 36px
        // or window.screen.availHeight < window.screen.height - 30
        const diff = window.screen.height - window.innerHeight;
        const has3Buttons = diff >= 36 || (window.screen.availHeight < window.screen.height - 30);
        if (has3Buttons) {
          document.documentElement.classList.add("has-android-3button");
        } else {
          document.documentElement.classList.remove("has-android-3button");
        }
      }
    };

    updateNavDetection();
    window.addEventListener("resize", updateNavDetection, { passive: true });

    // 2. Scroll detection for dock auto-hide
    const scrollContainer = document.querySelector(".app-content");
    if (!scrollContainer) {
      return () => window.removeEventListener("resize", updateNavDetection);
    }

    const handleScroll = () => {
      const currentScrollY = scrollContainer.scrollTop;
      if (currentScrollY > lastScrollY.value + 12 && currentScrollY > 40) {
        // Scrolling down -> hide dock like Apple iOS/macOS
        isHidden.value = true;
      } else if (currentScrollY < lastScrollY.value - 8 || currentScrollY <= 20) {
        // Scrolling up or at top -> reveal dock
        isHidden.value = false;
      }
      lastScrollY.value = currentScrollY;
    };

    scrollContainer.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("resize", updateNavDetection);
      scrollContainer.removeEventListener("scroll", handleScroll);
    };
  });

  return (
    <div
      class={`tabs-mobile-dock ${isHidden.value ? "dock-hidden" : ""} ${props.class || ""}`}
    >
      <Slot />
    </div>
  );
});
