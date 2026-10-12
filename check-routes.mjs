const routes = ["/","/about","/experience","/volunteer","/education","/skills","/projects","/achievements","/certifications","/documents","/contact","/admin","/login","/setup","/sitemap.xml","/robots.txt","/admin/settings","/admin/inbox"];
const results = await Promise.all(routes.map(async (r) => {
  try {
    const res = await fetch("http://localhost:3001" + r, { redirect: "manual" });
    return `${res.status}\t${r}`;
  } catch (e) { return `ERR\t${r}\t${e.message}`; }
}));
console.log(results.join("\n"));
