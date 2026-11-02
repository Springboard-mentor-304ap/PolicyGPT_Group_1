import { Component, OnInit, inject } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { ActivatedRoute } from '@angular/router';

interface PolicyDetail {
  id: number;
  title: string;
  ministry: string;
  category: string;
  description: string;
  about: string;
  objective: string;
  launchYear: string;
  targetBeneficiaries: string;
  coverage: string;
  nodalMinistry: string;
  policyType: string;
  officialWebsite: string;
  isBookmarked: boolean;
  highlights: string[];
  helplinePhone: string;
  helplineEmail: string;
  eligibility: string[];
  benefits: string[];
  documents: string[];
}

@Component({
  selector: 'app-policy-details',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './policy-details.component.html',
  styleUrls: ['./policy-details.component.scss']
})
export class PolicyDetailsComponent implements OnInit {
  private readonly location = inject(Location);
  private readonly route = inject(ActivatedRoute);

  activeTab: 'overview' | 'eligibility' | 'benefits' | 'documents' = 'overview';

  policy: PolicyDetail = {
    id: 1,
    title: 'National Education Policy 2020',
    ministry: 'Ministry of Education',
    category: 'Education',
    description: 'A comprehensive policy to transform India\'s education system and make it more inclusive, equitable, multidisciplinary and aligned with 21st century needs.',
    about: 'The National Education Policy (NEP) 2020 is a landmark policy that envisions an education system rooted in Indian ethos that contributes directly to transforming India sustainably into an equitable and vibrant knowledge society by providing high quality education to all.',
    objective: 'To develop an education system that is accessible, equitable, inclusive and affordable to all, and to promote lifelong learning by providing high quality education.',
    launchYear: '2020',
    targetBeneficiaries: 'Students, Teachers, Institutions and Researchers',
    coverage: 'All States / UTs of India',
    nodalMinistry: 'Ministry of Education',
    policyType: 'National Policy',
    officialWebsite: 'https://www.education.gov.in',
    isBookmarked: false,
    highlights: [
      'Focus on holistic and multidisciplinary education',
      'New 5+3+3+4 curricular structure',
      'Emphasis on foundational literacy and numeracy',
      'Integration of vocational education from grade 6',
      'Use of technology and online education',
      'Promotes Indian languages and multilingualism',
      'Encourages research and innovation'
    ],
    helplinePhone: '1800-11-8600',
    helplineEmail: 'helpdesk.education@gov.in',
    eligibility: [
      'All Indian citizens enrolled or planning to enroll in educational institutions.',
      'Schools, Colleges, and Universities operating within India.',
      'Teachers and educational administrators.'
    ],
    benefits: [
      'Flexible choices of subjects and multidisciplinary learning paths.',
      'Multiple entry and exit points in higher education degrees.',
      'Integration of digital technology for accessible learning.',
      'Increased funding and research grants through NRF.'
    ],
    documents: [
      'Identity Proof (Aadhaar Card / Voter ID)',
      'Educational Certificates / Marksheets',
      'Institutional Enrollment Proof'
    ]
  };

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      // Fetch or filter by policy ID if connecting to an API
    }
  }

  setActiveTab(tab: 'overview' | 'eligibility' | 'benefits' | 'documents'): void {
    this.activeTab = tab;
  }

  toggleBookmark(): void {
    this.policy.isBookmarked = !this.policy.isBookmarked;
  }

  sharePolicy(): void {
    if (navigator.share) {
      navigator.share({
        title: this.policy.title,
        url: window.location.href
      }).catch(() => {});
    } else {
      navigator.clipboard.writeText(window.location.href);
      alert('Policy URL copied to clipboard!');
    }
  }

  goBack(): void {
    this.location.back();
  }
}
