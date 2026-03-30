function toggleTheme() {
    document.body.classList.toggle("light");
  }

  function init3DBackground() {
    if (typeof THREE === "undefined") return;

    const canvas = document.getElementById("bg3d");
    if (!canvas) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.z = 28;

    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);

    const starsGeometry = new THREE.BufferGeometry();
    const count = 900;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count * 3; i += 1) {
      positions[i] = (Math.random() - 0.5) * 100;
    }
    starsGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

    const starsMaterial = new THREE.PointsMaterial({
      size: 0.2,
      color: 0x7dd3fc,
      transparent: true,
      opacity: 0.85,
    });

    const stars = new THREE.Points(starsGeometry, starsMaterial);
    scene.add(stars);

    const orb = new THREE.Mesh(
      new THREE.IcosahedronGeometry(4.5, 2),
      new THREE.MeshStandardMaterial({
        color: 0xa855f7,
        emissive: 0x1d4ed8,
        roughness: 0.25,
        metalness: 0.55,
        wireframe: true,
      }),
    );
    orb.position.set(-10, 7, -12);
    scene.add(orb);

    const torus = new THREE.Mesh(
      new THREE.TorusKnotGeometry(2.6, 0.55, 120, 16),
      new THREE.MeshStandardMaterial({
        color: 0x22d3ee,
        emissive: 0x3b82f6,
        roughness: 0.3,
        metalness: 0.65,
      }),
    );
    torus.position.set(11, -4, -10);
    scene.add(torus);

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(5.2, 0.12, 20, 100),
      new THREE.MeshBasicMaterial({ color: 0xf472b6, transparent: true, opacity: 0.5 }),
    );
    ring.position.set(-10, 7, -12);
    ring.rotation.x = 1.3;
    scene.add(ring);

    const light1 = new THREE.PointLight(0x22d3ee, 1.2, 120);
    light1.position.set(12, 18, 20);
    scene.add(light1);

    const light2 = new THREE.PointLight(0xf472b6, 1, 120);
    light2.position.set(-20, -10, 10);
    scene.add(light2);

    const mouse = { x: 0, y: 0 };
    window.addEventListener("mousemove", (e) => {
      mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
      mouse.y = (e.clientY / window.innerHeight) * 2 - 1;
    });

    const animate = () => {
      stars.rotation.y += 0.0008;
      stars.rotation.x += 0.0003;
      orb.rotation.x += 0.003;
      orb.rotation.y += 0.004;
      torus.rotation.x -= 0.004;
      torus.rotation.y += 0.005;
      ring.rotation.z += 0.003;
      camera.position.x += (mouse.x * 1.8 - camera.position.x) * 0.03;
      camera.position.y += (-mouse.y * 1.1 - camera.position.y) * 0.03;
      renderer.render(scene, camera);
      window.requestAnimationFrame(animate);
    };
    animate();

    window.addEventListener("resize", () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  init3DBackground();
  
  function showNotification() {
    const el = document.getElementById("notification");
    if (!el) return;
  
    el.style.display = "block";
    setTimeout(() => {
      el.style.display = "none";
    }, 2500);
  }
  
  let allNews = [];
  let liveLast5hNews = [];

  function classifyNewsItem(n) {
    const haystack = `${n?.title ?? ""} ${n?.desc ?? ""}`.toLowerCase();

    const tamilNaduKeywords = [
      "tamil nadu",
      "chennai",
      "coimbatore",
      "madurai",
      "salem",
      "tiruchirappalli",
      "trichy",
      "tirunelveli",
      "erode",
      "vellore",
      "thanjavur",
      "kanyakumari",
      "kovai",
      "tn",
    ];

    if (tamilNaduKeywords.some((k) => haystack.includes(k))) return "Tamil Nadu";
    if (haystack.includes("india") || haystack.includes("indian")) return "India";
    return "Global";
  }

  function renderNews(list) {
    let html = "";
    list.forEach((n) => {
      const type = n.type || classifyNewsItem(n);
      const publishedText = formatPublishedTime(n.publishedAt);
      html += `
          <div class="news-item">
            <img src="${n.img || 'https://via.placeholder.com/120'}">
            <div>
              <h4>📍 ${type}</h4>
              <h3>${n.title}</h3>
              <p class="news-time">🕒 ${publishedText}</p>
              <p>${n.desc || ''}</p>
            </div>
          </div>
        `;
    });

    document.getElementById("news-list").innerHTML = html;
  }

  function updateDashboardBadges(allItems, liveItems) {
    const liveEl = document.getElementById("live-count");
    const breakingEl = document.getElementById("breaking-count");
    const totalEl = document.getElementById("total-count");
    if (liveEl) liveEl.innerText = `🔴 Live 5H: ${liveItems.length}`;
    if (breakingEl) {
      const breaking = allItems.filter((n) => n?.priority === 1).length;
      breakingEl.innerText = `⚡ Breaking: ${breaking}`;
    }
    if (totalEl) totalEl.innerText = `📰 Total: ${allItems.length}`;
  }

  function formatPublishedTime(publishedAt) {
    if (!publishedAt) return "Time unavailable";
    const date = new Date(publishedAt);
    if (Number.isNaN(date.getTime())) return "Time unavailable";

    const now = Date.now();
    const diffMs = now - date.getTime();
    const minutes = Math.floor(diffMs / 60000);
    if (minutes < 60) return `${Math.max(1, minutes)} min ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hr ago`;
    return date.toLocaleString();
  }

  window.filterNews = function filterNews(category) {
    if (!allNews.length) return;

    if (category === "All") {
      renderNews(allNews);
      return;
    }

    if (category === "Live 5H") {
      renderNews(liveLast5hNews);
      return;
    }

    const filtered = allNews.filter((n) => (n.type || classifyNewsItem(n)) === category);
    renderNews(filtered);
  };

  function showBreakingNews(news) {
    const important = (news || []).find((n) => n && n.priority === 1);

    if (important) {
      const popup = document.getElementById("breaking-popup");
      const text = document.getElementById("breaking-text");
      if (!popup || !text) return;

      text.innerText = "🚨 BREAKING: " + (important.title || "");
      popup.style.display = "block";

      setTimeout(() => {
        popup.style.display = "none";
      }, 5000);
    }
  }

  fetch("/api/data")
    .then((res) => res.json())
    .then((data) => {
  
      // AI Summary
      document.getElementById("ai-summary").innerText = data.summary;
  
      // News
      allNews = (data.news || []).map((n) => ({ ...n, type: n.type || classifyNewsItem(n) }));
      liveLast5hNews = (data.live_last_5h || []).map((n) => ({ ...n, type: n.type || classifyNewsItem(n) }));
      renderNews(allNews);
      showBreakingNews(allNews);
      updateDashboardBadges(allNews, liveLast5hNews);
  
      // Market
      const marketCurrent = document.getElementById("market-current");
      const marketHighLow = document.getElementById("market-highlow");
  
      if (marketCurrent && data.market) {
        marketCurrent.innerText = `Current: ${data.market.current ?? "—"}`;
      }
  
      if (marketHighLow && data.market) {
        marketHighLow.innerText = `High/Low: ${data.market.high ?? "—"} / ${data.market.low ?? "—"}`;
      }
  
      // Commodities
      const goldEl = document.getElementById("gold-price");
      const silverEl = document.getElementById("silver-price");
  
      if (goldEl) goldEl.innerText = `Gold: ${data.gold ?? "—"}`;
      if (silverEl) silverEl.innerText = `Silver: ${data.silver ?? "—"}`;
    })
    .catch((err) => {
      console.error("Failed to load /api/data", err);
    });
    