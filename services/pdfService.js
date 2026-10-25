import pdfParse from 'pdf-parse';

export class PdfService {
  async extractText(buffer) {
    if (!buffer) return '';
    try {
      const data = await pdfParse(buffer);
      return (data && data.text) ? data.text.trim() : '';
    } catch (error) {
      console.warn('[PdfService] Warning parsing PDF buffer with pdf-parse:', error.message);
      // Fallback: Attempt simple text extraction from raw stream if possible
      try {
        const raw = buffer.toString('utf-8');
        const textMatches = raw.match(/\(([^)]+)\)\s*Tj/g) || [];
        if (textMatches.length > 0) {
          return textMatches.map((m) => m.replace(/\(([^)]+)\)\s*Tj/, '$1')).join('\n');
        }
      } catch (e) {}
      return '';
    }
  }

  extractCvInfo(text) {
    if (!text) return { rawText: '', skills: [], experience: [], education: [] };

    const lower = text.toLowerCase();
    
    // Tech keywords detection
    const commonSkills = [
      'javascript', 'typescript', 'python', 'java', 'c#', 'c++', 'golang', 'go', 'php', 'ruby',
      'react', 'reactjs', 'next.js', 'vue', 'angular', 'nodejs', 'express', 'nestjs', 'fastapi',
      'django', 'flask', 'spring', 'spring boot', '.net', 'asp.net', 'laravel',
      'sql', 'mysql', 'postgresql', 'mongodb', 'redis', 'elasticsearch', 'sqlite',
      'docker', 'kubernetes', 'aws', 'azure', 'gcp', 'ci/cd', 'git', 'linux',
      'html', 'css', 'tailwind', 'bootstrap', 'figma',
      'qa', 'tester', 'selenium', 'playwright', 'cypress', 'machine learning', 'ai'
    ];

    const detectedSkills = [];
    for (const skill of commonSkills) {
      const escaped = skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const boundaryStart = /^\w/.test(skill) ? '\\b' : '';
      const boundaryEnd = /\w$/.test(skill) ? '\\b' : '';
      const regex = new RegExp(`${boundaryStart}${escaped}${boundaryEnd}`, 'i');
      if (regex.test(lower) && !detectedSkills.includes(skill)) {
        detectedSkills.push(skill);
      }
    }

    // Email & Phone
    const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    const phoneMatch = text.match(/(?:\+84|0)(?:3|5|7|8|9)[0-9]{8}\b/);

    return {
      rawText: text,
      email: emailMatch ? emailMatch[0] : null,
      phone: phoneMatch ? phoneMatch[0] : null,
      skills: detectedSkills,
      hasProjects: lower.includes('project') || lower.includes('dự án') || lower.includes('du an'),
      hasExperience: lower.includes('experience') || lower.includes('kinh nghiệm') || lower.includes('kinh nghiem'),
      hasEducation: lower.includes('education') || lower.includes('học vấn') || lower.includes('hoc van') || lower.includes('đại học'),
    };
  }
}

export const pdfService = new PdfService();
export default pdfService;
