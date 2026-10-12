const routes = ["/","/about","/experience","/volunteer","/education","/skills","/projects","/achievements","/certifications","/documents","/contact","/sitemap.xml","/robots.txt","/setup","/login","/admin","/admin/experience/new","/admin/certifications/new","/admin/settings","/media/certifications/bad","/nope"];
const out = await Promise.all(routes.map(async (r) => {
  try { const res = await fetch("http://localhost:3000" + r, { redirect: "manual" }); return `${res.status}\t${r}`; }
  catch (e) { return `ERR\t${r}`; }
}));
console.log(out.join("\n"));
const home = await (await fetch("http://localhost:3000/")).text();
console.log("---");
console.log("home title has Denrica:", /<title>[^<]*Denrica/.test(home));
console.log("home shows 'Nothing has been published yet':", home.includes("Nothing has been published yet"));
