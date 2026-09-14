import { CommonModule, Location } from '@angular/common';
import { Component } from '@angular/core';
import { Router } from '@angular/router';

interface CompareItem {
  id: number;
  title: string;
  type: 'Policy' | 'Scheme';
  ministry: string;
  category: string;
  state: string;
  targetGroup: string;
}

interface ComparisonData {
  ministry: string;
  category: string;
  targetGroup: string;
  objective: string;
  benefits: string;
  eligibility: string;
  application: string;
  website: string;
}

@Component({
  selector: 'app-compare-results',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './compare-results.component.html',
  styleUrl: './compare-results.component.scss',
})
export class CompareResultsComponent {

  items: CompareItem[] = [];

  item1: CompareItem | null = null;
  item2: CompareItem | null = null;
  item3: CompareItem | null = null;


  /*
   * Comparison information
   */
  comparisonData: { [key: string]: ComparisonData } = {

    'National Education Policy 2020': {
      ministry: 'Ministry of Education',
      category: 'Education Policy',
      targetGroup: 'Students, Teachers, Educational Institutions',
      objective:
        "To transform India's education system and promote holistic development.",
      benefits:
        'Improved learning outcomes, multidisciplinary education, and flexible learning opportunities.',
      eligibility:
        'Applicable to students, teachers, educational institutions, and other stakeholders in education.',
      application:
        'Implemented through educational institutions and government education programmes.',
      website: 'https://www.education.gov.in/',
    },

    'National Health Policy 2017': {
      ministry: 'Ministry of Health & Family Welfare',
      category: 'Health',
      targetGroup: 'Citizens',
      objective:
        'Improve the health status of the population through accessible and quality healthcare.',
      benefits:
        'Better healthcare access, preventive healthcare, affordable treatment, and improved health outcomes.',
      eligibility:
        'Applicable to citizens and healthcare stakeholders across India.',
      application:
        'Implemented through public health programmes, healthcare institutions, and government schemes.',
      website: 'https://www.mohfw.gov.in/',
    },

    'National Policy on Skill Development and Entrepreneurship 2015': {
      ministry: 'Ministry of Skill Development & Entrepreneurship',
      category: 'Skill Development',
      targetGroup: 'Youth, Workers, Entrepreneurs',
      objective:
        'Create a skilled workforce and promote entrepreneurship opportunities.',
      benefits:
        'Skill training, employment opportunities, entrepreneurship support, and industry-relevant skills.',
      eligibility:
        'Youth, workers, job seekers, and aspiring entrepreneurs.',
      application:
        'Through skill development programmes, training centres, and entrepreneurship initiatives.',
      website: 'https://www.msde.gov.in/',
    },

    'National Agriculture Policy': {
      ministry: 'Ministry of Agriculture & Farmers Welfare',
      category: 'Agriculture',
      targetGroup: 'Farmers',
      objective:
        'Support sustainable agricultural development and improve farm productivity.',
      benefits:
        'Improved agricultural productivity, better farming practices, technology adoption, and farmer support.',
      eligibility:
        'Farmers and agricultural stakeholders.',
      application:
        'Implemented through agricultural departments, programmes, and farmer support initiatives.',
      website: 'https://agriwelfare.gov.in/',
    },

    'PM Kisan Samman Nidhi': {
      ministry: 'Ministry of Agriculture & Farmers Welfare',
      category: 'Agriculture',
      targetGroup: 'Eligible Farmers',
      objective:
        'Provide financial support to eligible landholding farmer families.',
      benefits:
        'Direct income support through instalments transferred to eligible farmers.',
      eligibility:
        'Eligible landholding farmer families subject to applicable exclusion criteria.',
      application:
        'Registration and application through the PM-KISAN portal and designated authorities.',
      website: 'https://pmkisan.gov.in/',
    },

    'PM Surya Ghar Muft Bijli Yojana': {
      ministry: 'Ministry of New and Renewable Energy',
      category: 'Renewable Energy',
      targetGroup: 'Residential Electricity Consumers',
      objective:
        'Promote rooftop solar installations and provide affordable electricity to households.',
      benefits:
        'Rooftop solar subsidy, reduced electricity bills, and clean energy generation.',
      eligibility:
        'Eligible residential electricity consumers as per scheme guidelines.',
      application:
        'Apply through the official PM Surya Ghar portal and complete the required installation process.',
      website: 'https://www.pmsuryaghar.gov.in/',
    },

    'Post Matric Scholarship Scheme': {
      ministry: 'Ministry of Social Justice & Empowerment',
      category: 'Education',
      targetGroup: 'Eligible Students',
      objective:
        'Provide financial assistance to eligible students pursuing post-matric education.',
      benefits:
        'Financial assistance for education-related expenses and continued studies.',
      eligibility:
        'Students meeting the applicable category, income, academic, and other scheme requirements.',
      application:
        'Application through the National Scholarship Portal or the relevant state scholarship portal.',
      website: 'https://scholarships.gov.in/',
    },

    'PM Vishwakarma Yojana': {
      ministry: 'Ministry of Micro, Small & Medium Enterprises',
      category: 'Skill Development & Livelihood',
      targetGroup: 'Traditional Artisans and Craftspeople',
      objective:
        'Support traditional artisans and craftspeople through skills, tools, finance, and market support.',
      benefits:
        'Skill training, toolkit incentives, credit support, digital transaction incentives, and marketing assistance.',
      eligibility:
        'Eligible traditional artisans and craftspeople engaged in specified trades.',
      application:
        'Registration through Common Service Centres and the official PM Vishwakarma system.',
      website: 'https://pmvishwakarma.gov.in/',
    },

    'Ayushman Bharat PM-JAY': {
      ministry: 'Ministry of Health & Family Welfare',
      category: 'Healthcare',
      targetGroup: 'Eligible Families',
      objective:
        'Provide financial protection and access to secondary and tertiary healthcare services.',
      benefits:
        'Cashless healthcare coverage for eligible beneficiaries at empanelled hospitals.',
      eligibility:
        'Families identified according to the applicable beneficiary database and scheme criteria.',
      application:
        'Beneficiary verification and registration through authorised channels and hospitals.',
      website: 'https://pmjay.gov.in/',
    },

    'Pradhan Mantri Jan Dhan Yojana': {
      ministry: 'Ministry of Finance',
      category: 'Financial Inclusion',
      targetGroup: 'Unbanked Citizens',
      objective:
        'Provide access to banking and financial services to underserved citizens.',
      benefits:
        'Basic bank accounts, access to financial services, RuPay card, and eligible benefits.',
      eligibility:
        'Citizens eligible to open basic savings bank accounts according to applicable banking rules.',
      application:
        'Open an account through participating banks or authorised banking channels.',
      website: 'https://pmjdy.gov.in/',
    },

    'Pradhan Mantri Awas Yojana': {
      ministry: 'Ministry of Housing & Urban Affairs',
      category: 'Housing',
      targetGroup: 'Eligible Households',
      objective:
        'Promote access to affordable housing for eligible households.',
      benefits:
        'Housing assistance and applicable subsidies for eligible beneficiaries.',
      eligibility:
        'Eligibility depends on the applicable PMAY component and government criteria.',
      application:
        'Application through the relevant PMAY portal, local authority, or designated channel.',
      website: 'https://pmaymis.gov.in/',
    },
  };


  constructor(
    private location: Location,
    private router: Router
  ) {

    const navigation = window.history.state;

    if (navigation?.items && navigation.items.length >= 2) {

      this.items = navigation.items;

      this.item1 = navigation.items[0];
      this.item2 = navigation.items[1];

      if (navigation.items.length >= 3) {
        this.item3 = navigation.items[2];
      }

    }
  }


  /*
   * Returns comparison information for a selected item.
   */
  getData(item: CompareItem | null): ComparisonData {

    if (!item) {
      return {
        ministry: '-',
        category: '-',
        targetGroup: '-',
        objective: '-',
        benefits: '-',
        eligibility: '-',
        application: '-',
        website: '-',
      };
    }

    return (
      this.comparisonData[item.title] || {
        ministry: item.ministry || '-',
        category: item.category || '-',
        targetGroup: item.targetGroup || '-',
        objective: '-',
        benefits: '-',
        eligibility: '-',
        application: '-',
        website: '-',
      }
    );
  }


  /*
   * Selects the professional icon based on the policy/scheme name.
   */
  getIconType(item: CompareItem | null): string {

    if (!item) {
      return 'policy';
    }

    const title = item.title.toLowerCase();

    if (title.includes('education')) {
      return 'education';
    }

    if (title.includes('health')) {
      return 'health';
    }

    if (title.includes('agriculture')) {
      return 'agriculture';
    }

    if (item.type === 'Scheme') {
      return 'scheme';
    }

    return 'policy';
  }


  /*
   * Back to the previous page.
   */
  goBack(): void {
    this.location.back();
  }


  /*
   * Return to the compare selection page.
   */
  goToSelection(): void {
    this.router.navigate(['/compare']);
  }

}
