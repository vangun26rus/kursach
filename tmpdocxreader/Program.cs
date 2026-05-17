using System.IO.Compression;
using System.Text;
using System.Text.RegularExpressions;
using System.Xml.Linq;

var docxPath = @"C:\Users\User\Downloads\Telegram Desktop\Пример ВКР.docx";
var sectionNumber = args.Length > 0 ? args[0] : "4";

if (!Regex.IsMatch(sectionNumber, @"^\d+$"))
{
    Console.WriteLine("Pass numeric section number, e.g. 4 or 5.");
    return;
}

if (!File.Exists(docxPath))
{
    Console.WriteLine("DOCX file not found.");
    return;
}

using var archive = ZipFile.OpenRead(docxPath);
var documentEntry = archive.GetEntry("word/document.xml");
if (documentEntry is null)
{
    Console.WriteLine("word/document.xml not found.");
    return;
}

XDocument xml;
using (var stream = documentEntry.Open())
{
    xml = XDocument.Load(stream);
}

XNamespace w = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

static string Normalize(string value)
{
    var text = value.Replace('\u00A0', ' ');
    text = Regex.Replace(text, @"\s+", " ").Trim();
    return text;
}

var paragraphs = xml
    .Descendants(w + "p")
    .Select(p => Normalize(string.Concat(p.Descendants(w + "t").Select(t => t.Value))))
    .Where(t => !string.IsNullOrWhiteSpace(t))
    .ToList();

Console.OutputEncoding = Encoding.UTF8;
var starts = paragraphs
    .Select((text, index) => new { text, index })
    .Where(x => Regex.IsMatch(x.text, $"^{sectionNumber}(\\s|\\.|$)"))
    .Select(x => x.index)
    .ToList();

if (starts.Count == 0)
{
    Console.WriteLine($"Section {sectionNumber} not found.");
    return;
}

var start = starts[^1];
var nextSection = (int.Parse(sectionNumber) + 1).ToString();
var end = paragraphs.FindIndex(start + 1, p => Regex.IsMatch(p, $"^{nextSection}(\\s|\\.|$)"));
if (end < 0)
{
    end = paragraphs.Count;
}

var section = paragraphs.Skip(start).Take(end - start).ToList();

Console.WriteLine($"=== SECTION {sectionNumber} CONTENT ===");
Console.WriteLine($"Start paragraph index: {start + 1}");
Console.WriteLine($"End paragraph index: {end}");
Console.WriteLine($"Paragraphs in section: {section.Count}");
Console.WriteLine();

for (var i = 0; i < section.Count; i++)
{
    Console.WriteLine($"{start + i + 1:0000}: {section[i]}");
}

Console.WriteLine();
var figCount = section.Count(s => s.StartsWith("Рисунок", StringComparison.OrdinalIgnoreCase));
Console.WriteLine($"Figure captions in section {sectionNumber}: {figCount}");
