const $ = (selector) => document.querySelector(selector);

const featuredPlaces = [
  {
    name: "Bahu Fort",
    description: "A historic fort associated with Jammu's heritage.",
    search: "Bahu Fort"
  },
  {
    name: "Raghunath Temple",
    description: "A renowned temple complex in the heart of Jammu.",
    search: "Raghunath Temple Jammu"
  },
  {
    name: "Mubarak Mandi",
    description: "A former royal palace complex with distinctive architecture.",
    search: "Mubarak Mandi Palace"
  },
  {
    name: "Amar Mahal Palace",
    description: "A palace museum overlooking the Tawi River.",
    search: "Amar Mahal Palace"
  },
  {
    name: "Mansar Lake",
    description: "A scenic lake surrounded by hills and greenery.",
    search: "Mansar Lake Jammu"
  },
  {
    name: "Akhnoor Fort",
    description: "A historic fort near the Chenab River.",
    search: "Akhnoor Fort"
  }
];

const placesGrid = $("#placesGrid");
const placeStatus = $("#placeStatus");
const nearbyGrid = $("#nearbyGrid");
const nearbyStatus = $("#nearbyStatus");

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function makeMapURL(query) {
  return "https://www.openstreetmap.org/search?query=" +
    encodeURIComponent(query);
}

function makeCard(place) {
  const title = escapeHTML(place.title);
  const description = escapeHTML(place.description || "Explore this place in Jammu.");
  const mapURL = makeMapURL(place.title);
  const image = place.image || "";

  const article = document.createElement("article");
  article.className = "place-card";

  const img = document.createElement("img");
  img.alt = place.title;
  img.loading = "lazy";
  img.src = image;
  img.onerror = () => {
    img.onerror = null;
    img.style.display = "none";
  };

  const body = document.createElement("div");
  body.className = "card-body";
  body.innerHTML = `
    <h3>${title}</h3>
    <p>${description}</p>
    <div class="card-links">
      <a href="${mapURL}" target="_blank" rel="noopener noreferrer">View map ↗</a>
      ${place.wikiURL ? `<a href="${escapeHTML(place.wikiURL)}" target="_blank" rel="noopener noreferrer">Read history ↗</a>` : ""}
    </div>
  `;

  article.append(img, body);
  return article;
}

async function getWikipediaPlace(searchTerm) {
  const searchURL = new URL("https://en.wikipedia.org/w/api.php");
  searchURL.search = new URLSearchParams({
    action: "query",
    generator: "search",
    gsrsearch: searchTerm,
    gsrnamespace: "0",
    gsrlimit: "1",
    prop: "pageimages|extracts|info",
    piprop: "thumbnail",
    pithumbsize: "650",
    exintro: "1",
    explaintext: "1",
    inprop: "url",
    format: "json",
    origin: "*"
  }).toString();

  const response = await fetch(searchURL);
  if (!response.ok) throw new Error("Wikipedia search failed.");

  const data = await response.json();
  const pages = Object.values(data.query?.pages || {});
  if (!pages.length) return null;

  const page = pages[0];

  return {
    title: page.title,
    description: page.extract || "Find details and visitor information about this place.",
    image: page.thumbnail?.source || "",
    wikiURL: page.fullurl || `https://en.wikipedia.org/wiki/${encodeURIComponent(page.title)}`
  };
}

function renderPlaces(places, target) {
  target.replaceChildren();

  if (!places.length) {
    target.textContent = "No places found. Try another search.";
    return;
  }

  places.forEach((place) => target.appendChild(makeCard(place)));
}

async function loadFeaturedPlaces() {
  placesGrid.replaceChildren();

  for (const item of featuredPlaces) {
    const card = makeCard({
      title: item.name,
      description: item.description,
      image: ""
    });
    placesGrid.appendChild(card);
  }

  const cards = [...placesGrid.children];

  await Promise.all(featuredPlaces.map(async (item, index) => {
    try {
      const result = await getWikipediaPlace(item.search);
      if (!result) return;

      const oldCard = cards[index];
      const newCard = makeCard(result);
      placesGrid.replaceChild(newCard, oldCard);
    } catch (error) {
      console.warn("Could not load place details:", item.name, error);
    }
  }));
}

$("#placeForm").addEventListener("submit", async (event) => {
  event.preventDefault();

  const query = $("#placeInput").value.trim();
  if (!query) return;

  placeStatus.textContent = "Searching for place details...";
  placesGrid.replaceChildren();

  try {
    const result = await getWikipediaPlace(query);

    if (result) {
      renderPlaces([result], placesGrid);
      placeStatus.textContent = "Place found. Open the map or read its history.";
    } else {
      renderPlaces([{
        title: query,
        description: "No history article was found. You can still search for this location on the map."
      }], placesGrid);
      placeStatus.textContent = "No Wikipedia article found; map search is available.";
    }
  } catch (error) {
    renderPlaces([{
      title: query,
      description: "Place information could not load. You can still view its map."
    }], placesGrid);
    placeStatus.textContent = "Search service unavailable. Please try again.";
  }
});

async function geocodeLocation(query) {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.search = new URLSearchParams({
    q: query,
    format: "jsonv2",
    limit: "1"
  }).toString();

  const response = await fetch(url, {
    headers: { "Accept": "application/json" }
  });

  if (!response.ok) throw new Error("Location search failed.");

  const results = await response.json();
  if (!results.length) throw new Error("Location not found. Try a nearby landmark.");

  return results[0];
}

async function findNearby(latitude, longitude) {
  nearbyStatus.textContent = "Finding nearby places...";
  nearbyGrid.replaceChildren();

  const query = `
    [out:json][timeout:20];
    (
      node(around:5000,${latitude},${longitude})["tourism"~"attraction|museum|viewpoint|zoo"];
      way(around:5000,${latitude},${longitude})["tourism"~"attraction|museum|viewpoint|zoo"];
      node(around:5000,${latitude},${longitude})["historic"];
      node(around:5000,${latitude},${longitude})["amenity"~"restaurant|cafe"];
    );
    out center tags 30;
  `;

  const response = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=UTF-8" },
    body: query
  });

  if (!response.ok) throw new Error("Nearby search service is busy. Try again later.");

  const data = await response.json();

  const results = (data.elements || [])
    .map((item) => {
      const tags = item.tags || {};
      return {
        title: tags.name || tags.tourism || tags.historic || tags.amenity || "Nearby place",
        description: [
          tags.tourism,
          tags.historic,
          tags.amenity,
          tags.cuisine
        ].filter(Boolean).join(" · ") || "A place listed in OpenStreetMap.",
        latitude: item.lat ?? item.center?.lat,
        longitude: item.lon ?? item.center?.lon
      };
    })
    .filter((place) => place.latitude != null && place.longitude != null);

  const unique = [...new Map(results.map((place) =>
    [`${place.title}-${place.latitude}-${place.longitude}`, place]
  )).values()];

  nearbyGrid.replaceChildren();

  if (!unique.length) {
    nearbyStatus.textContent = "No nearby places were found in the map data.";
    return;
  }

  unique.forEach((place) => {
    const card = document.createElement("article");
    card.className = "place-card";

    const body = document.createElement("div");
    body.className = "card-body";
    body.innerHTML = `
      <h3>${escapeHTML(place.title)}</h3>
      <p>${escapeHTML(place.description)}</p>
      <div class="card-links">
        <a href="https://www.openstreetmap.org/?mlat=${place.latitude}&mlon=${place.longitude}#map=16/${place.latitude}/${place.longitude}"
           target="_blank" rel="noopener noreferrer">Open map ↗</a>
      </div>
    `;

    card.appendChild(body);
    nearbyGrid.appendChild(card);
  });

  nearbyStatus.textContent = `Found ${unique.length} nearby places from OpenStreetMap data.`;
}

$("#locationForm").addEventListener("submit", async (event) => {
  event.preventDefault();

  const query = $("#locationInput").value.trim();
  if (!query) return;

  nearbyStatus.textContent = "Finding your location...";

  try {
    const result = await geocodeLocation(query);
    await findNearby(Number(result.lat), Number(result.lon));
  } catch (error) {
    nearbyStatus.textContent = error.message;
  }
});

$("#gpsButton").addEventListener("click", () => {
  if (!navigator.geolocation) {
    nearbyStatus.textContent = "Your browser does not support location services.";
    return;
  }

  nearbyStatus.textContent = "Requesting location permission...";

  navigator.geolocation.getCurrentPosition(
    async (position) => {
      try {
        await findNearby(
          position.coords.latitude,
          position.coords.longitude
        );
      } catch (error) {
        nearbyStatus.textContent = error.message;
      }
    },
    () => {
      nearbyStatus.textContent =
        "Location permission was denied or unavailable. Enter a location instead.";
    },
    { enableHighAccuracy: false, timeout: 12000 }
  );
});

// AI Chat handling
const chatForm = $("#chatForm");
const chatInput = $("#chatInput");
const chatMessages = $("#chatMessages");
const chatSend = $("#chatSend");
const chatStatus = $("#chatStatus");
const chatHistory = [];

function addChatBubble(text, sender) {
  const bubble = document.createElement("div");
  bubble.className = `bubble ${sender}`;
  bubble.textContent = text;
  chatMessages.appendChild(bubble);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  return bubble;
}

chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const message = chatInput.value.trim();
  if (!message || chatSend.disabled) return;
  
  const lang = document.getElementById("aiLanguage").value;
  let promptMessage = message;
  if (lang !== "English") {
    promptMessage = `[Please reply completely in ${lang} language] ${message}`;
  }

  addChatBubble(message, "user");
  chatInput.value = "";
  chatSend.disabled = true;
  chatStatus.textContent = "Jammu Yatra AI is thinking...";

  const waiting = addChatBubble("Thinking...", "bot");

  const apiKey = document.getElementById("apiKeyInput")?.value.trim() || "YOUR_GEMINI_API_KEY";

  const geminiHistory = chatHistory.map(msg => ({
    role: msg.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: msg.content }]
  }));
  
  geminiHistory.push({
    role: "user",
    parts: [{ text: promptMessage }]
  });

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: geminiHistory
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error?.message || "The API request failed.");
    }

    const reply = data.candidates[0].content.parts[0].text;
    waiting.textContent = reply;
    chatHistory.push(
      { role: "user", content: promptMessage },
      { role: "assistant", content: reply }
    );

    if (chatHistory.length > 10) {
      chatHistory.splice(0, chatHistory.length - 10);
    }

    chatStatus.textContent = "";
  } catch (error) {
    waiting.textContent = "I couldn't connect to the AI right now. Check your API key.";
    chatStatus.textContent = error.message;
  } finally {
    chatSend.disabled = false;
    chatInput.focus();
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }
});

loadFeaturedPlaces();

// --- SMART ITINERARY PLANNER ---
const plannerForm = $('#plannerForm');
const plannerResult = $('#plannerResult');

if(plannerForm) {
  plannerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const loc = $("#planLocation").value;
    const time = $("#planTime").value;
    const mode = $("#planMode").value;
    const prefs = Array.from(document.querySelectorAll('.plan-pref:checked'))
                       .map(cb => cb.value)
                       .join(", ") || "General Sightseeing";
    
    const prompt = `I am currently at ${loc} in Jammu. I have ${time} hours available. I am traveling by ${mode}. My preferences and interests are: ${prefs}. Please create a detailed, step-by-step itinerary for me to visit places, try local food stalls, and experience the culture of Jammu within this specific time frame.`;
    
    const apiKey = "YOUR_GEMINI_API_KEY"; // Replace with your actual Gemini API key

    plannerResult.style.display = "block";
    plannerResult.innerHTML = "<strong>Generating your custom itinerary using AI...</strong>";
    
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          contents: [{
            role: "user",
            parts: [{ text: prompt }]
          }]
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || "Failed");
      
      const reply = data.candidates[0].content.parts[0].text;
      plannerResult.innerHTML = `
        <h3>Your Itinerary</h3>
        <div class="itinerary-content">
            ${escapeHTML(reply)
                .replace(/^#{1,6}\s+/gm, '')
                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                .replace(/^\s*[-*]\s+/gm, '• ')
                .replace(/\n/g, '<br>')}
        </div>
      `;
    } catch (error) {
      plannerResult.innerHTML = `<p style="color:red">Could not generate itinerary. Error: ${error.message}</p>`;
    }
  });
}