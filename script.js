// capture the chosen unit.
document.querySelectorAll(".dropdown-menu .item").forEach(item => {
  item.addEventListener("click", () => {
    const value = item.getAttribute("data-unit");
    console.log("Selected:", value);
  });
});

const menuItems = document.querySelectorAll(".dropdown-menu .item");

menuItems.forEach(item => {
  item.addEventListener("click", () => {
    
    const sectionTitle = item.previousElementSibling;
    
    // Remove previous selected from the same section
    let currentSectionItems = [];
    let next = item;
    
    while (next && !next.classList.contains("section-title")) {
      if (next.classList.contains("item")) currentSectionItems.push(next);
      next = next.nextElementSibling;
    }

    currentSectionItems.forEach(i => i.classList.remove("selected"));

    // Add selected state to the clicked one
    item.classList.add("selected");

  });
});