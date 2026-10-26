// How to take part, per governing body. Used by the website (app.js)
// and by the alert emails (src/alerts.js). Update contacts after elections.
export const PARTICIPATE = {
  city: {
    usualTime: "4:30 PM",
    location: "Commission Chamber, City Hall, 1001 College Street, Bowling Green",
    mapUrl: "https://www.google.com/maps/search/?api=1&query=1001+College+Street+Bowling+Green+KY",
    speak:
      "Sign up to speak at the back of the Commission Chamber when you arrive. " +
      "Speakers are called to the podium one at a time.",
    watch: { label: "Live on BGTV4 and online", url: "https://www.bgky.org/videos" },
    contacts: [
      { name: "Mayor Todd Alcott", email: "todd.alcott@bgky.org" },
      { name: "Carlos Bailey", email: "carlos.bailey@bgky.org" },
      { name: "Dana Beasley-Brown", email: "dana.beasleybrown@bgky.org" },
      { name: "Melinda Hill", email: "melinda.hill@bgky.org" },
      { name: "Sue Parrigin", email: "sue.parrigin@bgky.org" },
    ],
  },
  county: {
    usualTime: "9:00 AM",
    location: "Warren County Fiscal Courtroom, 429 East 10th Avenue, Bowling Green",
    mapUrl: "https://www.google.com/maps/search/?api=1&query=429+East+10th+Avenue+Bowling+Green+KY",
    speak: "To ask about speaking at a meeting, call the Fiscal Court office at 270-843-4146.",
    watch: { label: "Warren County on YouTube", url: "https://www.youtube.com/@warrencountykygov" },
    phone: { label: "270-843-4146", href: "tel:+12708434146" },
    findMagistrate: "https://bgky.maps.arcgis.com/apps/instant/sidebar/index.html?appid=1fba8d21efff42efb36b4fff8f7dbc8d",
    officialsPage: "https://www.warrencountyky.gov/departments/fiscal-court/#magistrates",
  },
};