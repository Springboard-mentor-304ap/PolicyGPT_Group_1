import { Component, OnInit, inject } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { ActivatedRoute } from '@angular/router';

interface SchemeDetails {
  id: number;
  title: string;
  ministry: string;
  category: string;
  description: string;
  aboutText: string;
  objective: string;
  nodalMinistry: string;
  schemeType: string;
  officialWebsite: string;
  launchDate: string;
  targetGroup: string;
  modeOfPayment: string;
  beneficiaries: string;
  financialAssistance: string;
  frequency: string;
  applicableAcross: string;
  isBookmarked?: boolean;
}

@Component({
  selector: 'app-scheme-details',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './scheme-details.component.html',
  styleUrls: ['./scheme-details.component.scss']
})
export class SchemeDetailsComponent implements OnInit {
  private readonly location = inject(Location);
  private readonly route = inject(ActivatedRoute);

  activeTab: 'overview' | 'eligibility' | 'benefits' | 'documents' = 'overview';
  schemeId: string | null = null;

  scheme: SchemeDetails = {
    id: 1,
    title: 'PM Kisan Samman Nidhi',
    ministry: 'Ministry of Agriculture & Farmers Welfare',
    category: 'Income Support',
    description: 'A central sector scheme that provides income support to all landholding farmer families across India.',
    aboutText: 'PM Kisan Samman Nidhi is a flagship scheme of the Government of India to provide direct income support to farmers. Under this scheme, eligible farmer families receive ₹6,000 per year in three equal installments of ₹2,000 each.',
    objective: 'Provide financial assistance to farmers to meet their agricultural and household needs.',
    nodalMinistry: 'Ministry of Agriculture & Farmers Welfare',
    schemeType: 'Central Sector Scheme',
    officialWebsite: 'https://pmkisan.gov.in/',
    launchDate: '24 February 2019',
    targetGroup: 'Small and Marginal Farmers',
    modeOfPayment: 'Direct Benefit Transfer (DBT)',
    beneficiaries: 'All landholding farmer families',
    financialAssistance: '₹6,000 per year\n(₹2,000 every 4 months)',
    frequency: 'Payment in 3 equal installments',
    applicableAcross: 'All States/UTs of India',
    isBookmarked: false
  };

  ngOnInit(): void {
    this.schemeId = this.route.snapshot.paramMap.get('id');
  }

  setActiveTab(tab: 'overview' | 'eligibility' | 'benefits' | 'documents'): void {
    this.activeTab = tab;
  }

  toggleBookmark(): void {
    this.scheme.isBookmarked = !this.scheme.isBookmarked;
  }

  applyNow(): void {
    if (this.scheme.officialWebsite) {
      window.open(this.scheme.officialWebsite, '_blank');
    }
  }

  goBack(): void {
    this.location.back();
  }
}
