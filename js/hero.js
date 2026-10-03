(function () {
  const scene = document.getElementById("hero-scene");
  const shark = document.querySelector(".whale-shark");
  if (!scene || !shark) return;

  let animating = false;

  function playEntrance() {
    if (animating) return;
    animating = true;
    shark.classList.remove("idle-swim");
    scene.classList.remove("enter-play");
    void shark.offsetWidth;
    scene.classList.add("enter-play");
  }

  shark.addEventListener("animationend", (e) => {
    if (e.animationName === "sharkEmerge") {
      scene.classList.remove("enter-play");
      shark.classList.add("idle-swim");
      animating = false;
    }
  });

  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) playEntrance();
        });
      },
      { threshold: 0.6 }
    );
    observer.observe(scene);
  } else {
    playEntrance();
  }
})();
