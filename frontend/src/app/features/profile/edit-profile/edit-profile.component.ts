import {
  Component,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  inject,
  OnInit,
} from "@angular/core";

import { CommonModule } from "@angular/common";

import {
  ReactiveFormsModule,
  FormBuilder,
  FormGroup,
  Validators,
} from "@angular/forms";

import { Router } from "@angular/router";
import { Observable, of, timeout } from "rxjs";

import { HttpClient } from "@angular/common/http";

import { Auth, AuthUser } from "../../../core/services/auth";
import { AvatarService } from "../../../core/services/avatar.service";
import { ToastService } from "../../../core/services/toast.service";
import {
  BreadcrumbComponent,
  BreadcrumbItem,
} from "../../../shared/components/breadcrumb/breadcrumb.component";
import { UserAvatarComponent } from "../../../shared/components/user-avatar/user-avatar.component";
import { SearchableSelectComponent } from "../../../shared/components/searchable-select/searchable-select.component";
import { environment } from '../../../../environments/environment';

@Component({
  selector: "app-edit-profile",

  standalone: true,

  imports: [CommonModule, ReactiveFormsModule, BreadcrumbComponent, UserAvatarComponent, SearchableSelectComponent],

  templateUrl: "./edit-profile.component.html",

  styleUrls: ["./edit-profile.component.scss"],

  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditProfileComponent implements OnInit {
  // =========================================================
  // SERVICES
  // =========================================================

  private readonly router = inject(Router);

  private readonly fb = inject(FormBuilder);

  private readonly cdr = inject(ChangeDetectorRef);

  private readonly authService = inject(Auth);

  private readonly avatarService = inject(AvatarService);

  private readonly toast = inject(ToastService);

  private readonly http = inject(HttpClient);

  private readonly apiUrl = `${environment.apiUrl}/auth`;

  /** Safety net for the profile-fields PUT (project uses 30s for
   * DB-only auth calls). Produces a real error state — never fake success. */
  private static readonly SAVE_TIMEOUT_MS = 30_000;

  // =========================================================
  // FORM
  // =========================================================

  profileForm!: FormGroup;

  // =========================================================
  // PROFILE PHOTO
  // =========================================================

  selectedPhotoUrl: string | null = null;

  /** File chosen this session, uploaded on Save (not immediately). */
  private pendingPhotoFile: File | null = null;

  /** True when the user asked to delete the current photo on Save. */
  private removePhotoRequested = false;

  /** Photo-specific validation/selection error (inline, no alert). */
  photoError = "";

  // =========================================================
  // UI STATE
  // =========================================================

  saving = false;
  successMessage = "";
  errorMessage = "";
  currentUser: AuthUser | null = null;

  // The HTML template uses these names. Keep them as getters so
  // the existing template and the TypeScript state stay in sync.
  get profileImage(): string | null {
    return this.selectedPhotoUrl;
  }

  get userName(): string {
    return (
      this.profileForm?.get("fullName")?.value ||
      this.currentUser?.full_name ||
      "User"
    );
  }

  get displayRole(): string {
    const role = String(
      (this.currentUser as (AuthUser & { role?: string }) | null)?.role ||
        "User",
    );
    return role
      .toLowerCase()
      .split("_")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }

  get states(): string[] {
    return this.stateOptions;
  }

  get districts(): string[] {
    return this.districtOptions;
  }

  // =========================================================
  // GENDER OPTIONS
  // =========================================================

  genderOptions: string[] = ["Male", "Female", "Other"];

  // =========================================================
  // OCCUPATION OPTIONS
  // =========================================================

  occupationOptions: string[] = [
    "Student",
    "Teacher / Professor",
    "Researcher",
    "Government Employee",
    "Private Sector Employee",
    "Business Owner",
    "Self-Employed",
    "Farmer",
    "Healthcare Professional",
    "Legal Professional",
    "Engineer / IT Professional",
    "Homemaker",
    "Retired",
    "Unemployed",
    "Other",
  ];

  // =========================================================
  // ORGANIZATION OPTIONS
  // =========================================================

  organizationOptions: string[] = [
    "Government Organization",
    "Private Company",
    "Educational Institution",
    "Research Institution",
    "Non-Governmental Organization (NGO)",
    "Non-Profit Organization",
    "Healthcare Organization",
    "Financial Institution",
    "Startup",
    "Business / Enterprise",
    "Self-Employed",
    "Other",
  ];

  // =========================================================
  // STATE OPTIONS
  // =========================================================

  stateOptions: string[] = [
    "Andaman and Nicobar Islands",
    "Andhra Pradesh",
    "Arunachal Pradesh",
    "Assam",
    "Bihar",
    "Chandigarh",
    "Chhattisgarh",
    "Dadra and Nagar Haveli and Daman and Diu",
    "Delhi",
    "Goa",
    "Gujarat",
    "Haryana",
    "Himachal Pradesh",
    "Jammu and Kashmir",
    "Jharkhand",
    "Karnataka",
    "Kerala",
    "Ladakh",
    "Lakshadweep",
    "Madhya Pradesh",
    "Maharashtra",
    "Manipur",
    "Meghalaya",
    "Mizoram",
    "Nagaland",
    "Odisha",
    "Puducherry",
    "Punjab",
    "Rajasthan",
    "Sikkim",
    "Tamil Nadu",
    "Telangana",
    "Tripura",
    "Uttar Pradesh",
    "Uttarakhand",
    "West Bengal",
  ];

  // =========================================================
  // DISTRICT OPTIONS
  // =========================================================

  districtOptions: string[] = [];

  // =========================================================
  // STATE -> DISTRICT MAP
  // =========================================================

  private readonly stateDistrictsMap: {
    [key: string]: string[];
  } = {
    "Andaman and Nicobar Islands": [
      "Nicobar",
      "North and Middle Andaman",
      "South Andaman",
    ],

    "Andhra Pradesh": [
      "Alluri Sitharama Raju",
      "Anakapalli",
      "Ananthapuramu",
      "Annamayya",
      "Bapatla",
      "Chittoor",
      "East Godavari",
      "Eluru",
      "Guntur",
      "Kakinada",
      "Konaseema",
      "NT Rama Rao",
      "Nandyal",
      "Palnadu",
      "Parvathipuram Manyam",
      "Prakasam",
      "Srikakulam",
      "Sri Potti Sriramulu Nellore",
      "Sri Sathya Sai",
      "Tirupati",
      "Visakhapatnam",
      "Vizianagaram",
      "West Godavari",
      "YSR Kadapa",
    ],

    "Arunachal Pradesh": [
      "Anjaw",
      "Changlang",
      "Dibang Valley",
      "East Kameng",
      "East Siang",
      "Kamle",
      "Kra Daadi",
      "Kurung Kumey",
      "Lepa Rada",
      "Lohit",
      "Longding",
      "Lower Dibang Valley",
      "Lower Subansiri",
      "Namsai",
      "Pakke Kessang",
      "Papum Pare",
      "Shi Yomi",
      "Siang",
      "Tawang",
      "Tirap",
      "Upper Siang",
      "Upper Subansiri",
      "West Kameng",
      "West Siang",
    ],

    Assam: [
      "Baksa",
      "Barpeta",
      "Biswanath",
      "Bongaigaon",
      "Cachar",
      "Charaideo",
      "Chirang",
      "Darrang",
      "Dhemaji",
      "Dhubri",
      "Dibrugarh",
      "Dima Hasao",
      "Goalpara",
      "Golaghat",
      "Hailakandi",
      "Hojai",
      "Jorhat",
      "Kamrup",
      "Kamrup Metropolitan",
      "Karbi Anglong",
      "Karimganj",
      "Kokrajhar",
      "Lakhimpur",
      "Majuli",
      "Morigaon",
      "Nagaon",
      "Nalbari",
      "Sivasagar",
      "Sonitpur",
      "South Salmara-Mankachar",
      "Tinsukia",
      "Udalguri",
      "West Karbi Anglong",
    ],

    Bihar: [
      "Araria",
      "Arwal",
      "Aurangabad",
      "Banka",
      "Begusarai",
      "Bhagalpur",
      "Bhojpur",
      "Buxar",
      "Darbhanga",
      "East Champaran",
      "Gaya",
      "Gopalganj",
      "Jamui",
      "Jehanabad",
      "Kaimur",
      "Katihar",
      "Khagaria",
      "KishanGanj",
      "Lakhisarai",
      "Madhepura",
      "Madhubani",
      "Munger",
      "Muzaffarpur",
      "Nalanda",
      "Nawada",
      "Patna",
      "Purnia",
      "Rohtas",
      "Saharsa",
      "Samastipur",
      "Saran",
      "Sheikhpura",
      "Sheohar",
      "Sitamarhi",
      "Siwan",
      "Supaul",
      "Vaishali",
      "West Champaran",
    ],

    Chandigarh: ["Chandigarh"],

    Chhattisgarh: [
      "Balod",
      "Baloda Bazar",
      "Balrampur",
      "Bastar",
      "Bemetara",
      "Bijapur",
      "Bilaspur",
      "Dantewada",
      "Dhamtari",
      "Durg",
      "Gariaband",
      "Gaurela-Pendra-Marwahi",
      "Janjgir-Champa",
      "Jashpur",
      "Kabirdham",
      "Kanker",
      "Kondagaon",
      "Korba",
      "Koriya",
      "Mahasamund",
      "Manendragarh-Chirmiri-Bharatpur",
      "Mohla-Manpur-Ambagarh Chowki",
      "Mungeli",
      "Narayanpur",
      "Raigarh",
      "Raipur",
      "Rajnandgaon",
      "Sukma",
      "Surajpur",
      "Surguja",
    ],

    "Dadra and Nagar Haveli and Daman and Diu": [
      "Dadra and Nagar Haveli",
      "Daman",
      "Diu",
    ],

    Delhi: [
      "Central Delhi",
      "East Delhi",
      "New Delhi",
      "North Delhi",
      "North East Delhi",
      "North West Delhi",
      "Shahdara",
      "South Delhi",
      "South East Delhi",
      "South West Delhi",
      "West Delhi",
    ],

    Goa: ["North Goa", "South Goa"],

    Gujarat: [
      "Ahmedabad",
      "Amreli",
      "Anand",
      "Aravalli",
      "Banaskantha",
      "Bharuch",
      "Bhavnagar",
      "Botad",
      "Chhota Udaipur",
      "Dahod",
      "Dang",
      "Devbhoomi Dwarka",
      "Gandhinagar",
      "Gir Somnath",
      "Jamnagar",
      "Junagadh",
      "Kheda",
      "Kutch",
      "Mahisagar",
      "Mehsana",
      "Morbi",
      "Narmada",
      "Navsari",
      "Panchmahal",
      "Patan",
      "Porbandar",
      "Rajkot",
      "Sabarkantha",
      "Surat",
      "Surendranagar",
      "Tapi",
      "Vadodara",
      "Valsad",
    ],

    Haryana: [
      "Ambala",
      "Bhiwani",
      "Charkhi Dadri",
      "Faridabad",
      "Fatehabad",
      "Gurugram",
      "Hisar",
      "Jhajjar",
      "Jind",
      "Kaithal",
      "Karnal",
      "Kurukshetra",
      "Mahendragarh",
      "Nuh",
      "Palwal",
      "Panchkula",
      "Panipat",
      "Rewari",
      "Rohtak",
      "Sirsa",
      "Sonipat",
      "Yamunanagar",
    ],

    "Himachal Pradesh": [
      "Bilaspur",
      "Chamba",
      "Hamirpur",
      "Kangra",
      "Kinnaur",
      "Kullu",
      "Lahaul and Spiti",
      "Mandi",
      "Shimla",
      "Sirmaur",
      "Solan",
      "Una",
    ],

    "Jammu and Kashmir": [
      "Anantnag",
      "Bandipora",
      "Baramulla",
      "Budgam",
      "Doda",
      "Ganderbal",
      "Jammu",
      "Kathua",
      "Kishtwar",
      "Kulgam",
      "Kupwara",
      "Poonch",
      "Pulwama",
      "Rajouri",
      "Ramban",
      "Reasi",
      "Samba",
      "Shopian",
      "Srinagar",
      "Udhampur",
    ],

    Jharkhand: [
      "Bokaro",
      "Chatra",
      "Deoghar",
      "Dhanbad",
      "Dumka",
      "East Singhbhum",
      "Garhwa",
      "Giridih",
      "Godda",
      "Gumla",
      "Hazaribag",
      "Jamtara",
      "Khunti",
      "Koderma",
      "Latehar",
      "Lohardaga",
      "Pakur",
      "Palamu",
      "Ramgarh",
      "Ranchi",
      "Sahebganj",
      "Seraikela Kharsawan",
      "Simdega",
      "West Singhbhum",
    ],

    Karnataka: [
      "Bagalkot",
      "Ballari",
      "Belagavi",
      "Bengaluru Rural",
      "Bengaluru Urban",
      "Bidar",
      "Chamarajanagar",
      "Chikkaballapura",
      "Chikkamagaluru",
      "Chitradurga",
      "Dakshina Kannada",
      "Davanagere",
      "Dharwad",
      "Gadag",
      "Hassan",
      "Haveri",
      "Kalaburagi",
      "Kodagu",
      "Kolar",
      "Koppal",
      "Mandya",
      "Mysuru",
      "Raichur",
      "Ramanagara",
      "Shivamogga",
      "Tumakuru",
      "Udupi",
      "Uttara Kannada",
      "Vijayanagara",
      "Vijayapura",
      "Yadgir",
    ],

    Kerala: [
      "Alappuzha",
      "Ernakulam",
      "Idukki",
      "Kannur",
      "Kasaragod",
      "Kollam",
      "Kottayam",
      "Kozhikode",
      "Malappuram",
      "Palakkad",
      "Pathanamthitta",
      "Thiruvananthapuram",
      "Thrissur",
      "Wayanad",
    ],

    Ladakh: ["Kargil", "Leh"],

    Lakshadweep: ["Lakshadweep"],

    "Madhya Pradesh": [
      "Agar Malwa",
      "Alirajpur",
      "Anuppur",
      "Ashoknagar",
      "Balaghat",
      "Barwani",
      "Betul",
      "Bhind",
      "Bhopal",
      "Burhanpur",
      "Chhatarpur",
      "Chhindwara",
      "Damoh",
      "Datia",
      "Dewas",
      "Dhar",
      "Dindori",
      "Guna",
      "Gwalior",
      "Harda",
      "Narmadapuram",
      "Indore",
      "Jabalpur",
      "Jhabua",
      "Katni",
      "Khandwa",
      "Khargone",
      "Mandla",
      "Mandsaur",
      "Morena",
      "Narsinghpur",
      "Neemuch",
      "Niwari",
      "Panna",
      "Raisen",
      "Rajgarh",
      "Ratlam",
      "Rewa",
      "Sagar",
      "Satna",
      "Sehore",
      "Seoni",
      "Shahdol",
      "Shajapur",
      "Sheopur",
      "Shivpuri",
      "Sidhi",
      "Singrauli",
      "Tikamgarh",
      "Ujjain",
      "Umaria",
      "Vidisha",
    ],

    Maharashtra: [
      "Ahmednagar",
      "Akola",
      "Amravati",
      "Aurangabad",
      "Beed",
      "Bhandara",
      "Buldhana",
      "Chandrapur",
      "Dhule",
      "Gadchiroli",
      "Gondia",
      "Hingoli",
      "Jalgaon",
      "Jalna",
      "Kolhapur",
      "Latur",
      "Mumbai City",
      "Mumbai Suburban",
      "Nagpur",
      "Nanded",
      "Nandurbar",
      "Nashik",
      "Osmanabad",
      "Palghar",
      "Parbhani",
      "Pune",
      "Raigad",
      "Ratnagiri",
      "Sangli",
      "Satara",
      "Sindhudurg",
      "Solapur",
      "Thane",
      "Wardha",
      "Washim",
      "Yavatmal",
    ],

    Manipur: [
      "Bishnupur",
      "Chandel",
      "Churachandpur",
      "Imphal East",
      "Imphal West",
      "Jiribam",
      "Kakching",
      "Kamjong",
      "Kangpokpi",
      "Noney",
      "Pherzawl",
      "Senapati",
      "Tamenglong",
      "Tengnoupal",
      "Thoubal",
      "Ukhrul",
    ],

    Meghalaya: [
      "East Garo Hills",
      "East Jaintia Hills",
      "East Khasi Hills",
      "Eastern West Khasi Hills",
      "North Garo Hills",
      "Ri Bhoi",
      "South Garo Hills",
      "South West Garo Hills",
      "South West Khasi Hills",
      "West Garo Hills",
      "West Jaintia Hills",
      "West Khasi Hills",
    ],

    Mizoram: [
      "Aizawl",
      "Champhai",
      "Hnahthial",
      "Khawzawl",
      "Kolasib",
      "Lawngtlai",
      "Lunglei",
      "Mamit",
      "Saiha",
      "Saitual",
      "Serchhip",
    ],

    Nagaland: [
      "Chümoukedima",
      "Dimapur",
      "Kiphire",
      "Kohima",
      "Longleng",
      "Mokokchung",
      "Mon",
      "Niuland",
      "Noklak",
      "Peren",
      "Phek",
      "Shamator",
      "Tseminyu",
      "Tuensang",
      "Wokha",
      "Zunheboto",
    ],

    Odisha: [
      "Angul",
      "Balangir",
      "Balasore",
      "Bargarh",
      "Bhadrak",
      "Boudh",
      "Cuttack",
      "Deogarh",
      "Dhenkanal",
      "Gajapati",
      "Ganjam",
      "Jagatsinghapur",
      "Jajpur",
      "Jharsuguda",
      "Kalahandi",
      "Kandhamal",
      "Kendrapara",
      "Kendujhar",
      "Khordha",
      "Koraput",
      "Malkangiri",
      "Mayurbhanj",
      "Nabarangpur",
      "Nayagarh",
      "Nuapada",
      "Puri",
      "Rayagada",
      "Sambalpur",
      "Sonepur",
      "Sundargarh",
    ],

    Puducherry: ["Karaikal", "Mahe", "Puducherry", "Yanam"],

    Punjab: [
      "Amritsar",
      "Barnala",
      "Bathinda",
      "Faridkot",
      "Fatehgarh Sahib",
      "Fazilka",
      "Ferozepur",
      "Gurdaspur",
      "Hoshiarpur",
      "Jalandhar",
      "Kapurthala",
      "Ludhiana",
      "Malerkotla",
      "Mansa",
      "Moga",
      "Muktsar",
      "Pathankot",
      "Patiala",
      "Rupnagar",
      "Sahibzada Ajit Singh Nagar",
      "Sangrur",
      "Shahid Bhagat Singh Nagar",
      "Tarn Taran",
    ],

    Rajasthan: [
      "Ajmer",
      "Alwar",
      "Banswara",
      "Baran",
      "Barmer",
      "Bharatpur",
      "Bhilwara",
      "Bikaner",
      "Bundi",
      "Chittorgarh",
      "Churu",
      "Dausa",
      "Dholpur",
      "Dungarpur",
      "Hanumangarh",
      "Jaipur",
      "Jaisalmer",
      "Jalore",
      "Jhalawar",
      "Jhunjhunu",
      "Jodhpur",
      "Karauli",
      "Kota",
      "Nagaur",
      "Pali",
      "Pratapgarh",
      "Rajsamand",
      "Sawai Madhopur",
      "Sikar",
      "Sirohi",
      "Sri Ganganagar",
      "Tonk",
      "Udaipur",
    ],

    Sikkim: [
      "East Sikkim",
      "North Sikkim",
      "Pakyong",
      "Soreng",
      "South Sikkim",
      "West Sikkim",
    ],

    "Tamil Nadu": [
      "Ariyalur",
      "Chengalpattu",
      "Chennai",
      "Coimbatore",
      "Cuddalore",
      "Dharmapuri",
      "Dindigul",
      "Erode",
      "Kanchipuram",
      "Kanyakumari",
      "Karur",
      "Krishnagiri",
      "Madurai",
      "Mayiladuthurai",
      "Nagapattinam",
      "Namakkal",
      "Nilgiris",
      "Perambalur",
      "Pudukkottai",
      "Ramanathapuram",
      "Ranipet",
      "Salem",
      "Sivaganga",
      "Tenkasi",
      "Thanjavur",
      "Theni",
      "Thoothukudi",
      "Tiruchirappalli",
      "Tirunelveli",
      "Tirupathur",
      "Tiruppur",
      "Tiruvallur",
      "Tiruvannamalai",
      "Tiruvarur",
      "Vellore",
      "Viluppuram",
      "Virudhunagar",
    ],

    Telangana: [
      "Adilabad",
      "Bhadradri Kothagudem",
      "Hanamkonda",
      "Hyderabad",
      "Jagtial",
      "Jangaon",
      "Jayashankar Bhupalpally",
      "Jogulamba Gadwal",
      "Kamareddy",
      "Karimnagar",
      "Khammam",
      "Komaram Bheem Asifabad",
      "Mahabubabad",
      "Mahabubnagar",
      "Mancherial",
      "Medak",
      "Medchal-Malkajgiri",
      "Mulugu",
      "Nalgonda",
      "Narayanpet",
      "Nirmal",
      "Nizamabad",
      "Peddapalli",
      "Rajanna Sircilla",
      "Rangareddy",
      "Sangareddy",
      "Siddipet",
      "Suryapet",
      "Vikarabad",
      "Wanaparthy",
      "Warangal",
      "Yadadri Bhuvanagiri",
    ],

    Tripura: [
      "Dhalai",
      "Gomati",
      "Khowai",
      "North Tripura",
      "Sepahijala",
      "South Tripura",
      "Unakoti",
      "West Tripura",
    ],

    "Uttar Pradesh": [
      "Agra",
      "Aligarh",
      "Ambedkar Nagar",
      "Amethi",
      "Amroha",
      "Auraiya",
      "Ayodhya",
      "Azamgarh",
      "Baghpat",
      "Bahraich",
      "Ballia",
      "Balrampur",
      "Banda",
      "Barabanki",
      "Bareilly",
      "Basti",
      "Bhadohi",
      "Bijnor",
      "Budaun",
      "Bulandshahr",
      "Chandauli",
      "Chitrakoot",
      "Deoria",
      "Etah",
      "Etawah",
      "Farrukhabad",
      "Fatehpur",
      "Firozabad",
      "Gautam Buddha Nagar",
      "Ghaziabad",
      "Ghazipur",
      "Gonda",
      "Gorakhpur",
      "Hamirpur",
      "Hapur",
      "Hardoi",
      "Hathras",
      "Jalaun",
      "Jaunpur",
      "Jhansi",
      "Kannauj",
      "Kanpur Dehat",
      "Kanpur Nagar",
      "Kasganj",
      "Kaushambi",
      "Kheri",
      "Kushinagar",
      "Lalitpur",
      "Lucknow",
      "Maharajganj",
      "Mahoba",
      "Mainpuri",
      "Mathura",
      "Mau",
      "Meerut",
      "Mirzapur",
      "Moradabad",
      "Muzaffarnagar",
      "Pilibhit",
      "Pratapgarh",
      "Prayagraj",
      "Raebareli",
      "Rampur",
      "Saharanpur",
      "Sambhal",
      "Sant Kabir Nagar",
      "Shahjahanpur",
      "Shamli",
      "Shravasti",
      "Siddharthnagar",
      "Sitapur",
      "Sonbhadra",
      "Sultanpur",
      "Unnao",
      "Varanasi",
    ],

    Uttarakhand: [
      "Almora",
      "Bageshwar",
      "Chamoli",
      "Champawat",
      "Dehradun",
      "Haridwar",
      "Nainital",
      "Pauri Garhwal",
      "Pithoragarh",
      "Rudraprayag",
      "Tehri Garhwal",
      "Udham Singh Nagar",
      "Uttarkashi",
    ],

    "West Bengal": [
      "Alipurduar",
      "Bankura",
      "Birbhum",
      "Cooch Behar",
      "Dakshin Dinajpur",
      "Darjeeling",
      "Hooghly",
      "Howrah",
      "Jalpaiguri",
      "Jhargram",
      "Kalimpong",
      "Kolkata",
      "Malda",
      "Murshidabad",
      "Nadia",
      "North 24 Parganas",
      "Paschim Bardhaman",
      "Paschim Medinipur",
      "Purba Bardhaman",
      "Purba Medinipur",
      "Purulia",
      "South 24 Parganas",
      "Uttar Dinajpur",
    ],
  };

  // =========================================================
  // INIT
  // =========================================================

  ngOnInit(): void {
    this.initForm();

    this.loadCurrentUser();
  }

  // =========================================================
  // INITIALIZE FORM
  // =========================================================

  private initForm(): void {
    this.profileForm = this.fb.group({
      fullName: ["", [Validators.required]],

      dob: ["", [Validators.required]],

      gender: ["", [Validators.required]],

      state: ["", [Validators.required]],

      district: ["", [Validators.required]],

      occupation: ["", [Validators.required]],

      organization: ["", [Validators.required]],

      phone: ["", [Validators.required, Validators.pattern("^[0-9]{10}$")]],

      email: ["", [Validators.required, Validators.email]],
    });
  }

  // =========================================================
  // LOAD CURRENT USER
  // =========================================================

  private loadCurrentUser(): void {
    // -------------------------------------------------------
    // FIRST USE SHARED SNAPSHOT (login/app-init, incl. photo)
    // -------------------------------------------------------

    const cachedUser =
      this.authService.getCurrentUserSnapshot?.() ??
      this.authService.getStoredUser();

    if (cachedUser) {
      this.patchUserData(cachedUser);
    }

    // -------------------------------------------------------
    // THEN REFRESH SHARED STATE FROM BACKEND (deduplicated)
    // -------------------------------------------------------

    this.authService.getCurrentUser().subscribe({
      next: (user: AuthUser) => {
        if (user) {
          this.patchUserData(user);
        }
      },

      error: (error: unknown) => {
        console.error("Unable to load current user:", error);
      },
    });
  }

  // =========================================================
  // PATCH USER DATA
  // =========================================================

  private patchUserData(user: AuthUser): void {
    this.currentUser = user;
    const state = user.state || "";

    // Update district list BEFORE
    // setting district value.

    this.updateDistrictList(state, false);

    this.profileForm.patchValue({
      fullName: user.full_name || "",

      dob: user.date_of_birth
        ? this.formatDateForInput(user.date_of_birth)
        : "",

      gender: user.gender || "",

      state: state,

      district: user.district || "",

      occupation: user.occupation || "",

      organization: user.organization || "",

      phone: this.cleanPhone(user.phone || ""),

      email: user.email || "",
    });

    // Show the persisted photo (server source of truth) unless the
    // user already picked a replacement or asked for removal.
    if (!this.pendingPhotoFile && !this.removePhotoRequested) {
      this.avatarService.photoSrcFor(user).subscribe({
        next: (src) => {
          if (!this.pendingPhotoFile && !this.removePhotoRequested) {
            this.selectedPhotoUrl = src;
          }
          this.cdr.markForCheck();
        },
        error: () => {
          if (!this.pendingPhotoFile && !this.removePhotoRequested) {
            this.selectedPhotoUrl = null;
          }
          this.cdr.markForCheck();
        },
      });
    }

    this.cdr.markForCheck();
  }

  // =========================================================
  // FORMAT DATE FOR HTML DATE INPUT
  // =========================================================

  private formatDateForInput(value: string | Date): string {
    if (value instanceof Date) {
      const year = value.getFullYear();

      const month = String(value.getMonth() + 1).padStart(2, "0");

      const day = String(value.getDate()).padStart(2, "0");

      return `${year}-${month}-${day}`;
    }

    const valueString = String(value);

    // Already YYYY-MM-DD

    if (/^\d{4}-\d{2}-\d{2}$/.test(valueString)) {
      return valueString;
    }

    // Try Date parsing

    const parsedDate = new Date(valueString);

    if (!Number.isNaN(parsedDate.getTime())) {
      const year = parsedDate.getFullYear();

      const month = String(parsedDate.getMonth() + 1).padStart(2, "0");

      const day = String(parsedDate.getDate()).padStart(2, "0");

      return `${year}-${month}-${day}`;
    }

    return "";
  }

  // =========================================================
  // CLEAN PHONE
  // =========================================================

  private cleanPhone(phone: string): string {
    return String(phone).replace(/\D/g, "").slice(-10);
  }

  // =========================================================
  // STATE CHANGE LISTENER
  // =========================================================

  private setupStateChangeListener(): void {
    this.profileForm
      .get("state")
      ?.valueChanges.subscribe((selectedState: string) => {
        this.updateDistrictList(selectedState, true);
      });
  }

  // =========================================================
  // STATE CHANGE
  // =========================================================

  onStateChange(): void {
    const selectedState = this.profileForm.get("state")?.value || "";
    this.updateDistrictList(selectedState, true);
  }

  // =========================================================
  // UPDATE DISTRICT LIST
  // =========================================================

  private updateDistrictList(
    stateName: string,
    resetDistrictSelection = false,
  ): void {
    if (!stateName) {
      this.districtOptions = [];
    } else {
      const cleanStateName = stateName.trim().toLowerCase();

      const matchedKey = Object.keys(this.stateDistrictsMap).find(
        (key) => key.toLowerCase() === cleanStateName,
      );

      this.districtOptions = matchedKey
        ? [...this.stateDistrictsMap[matchedKey]]
        : [];
    }

    // Reset district only when
    // user manually changes state.

    if (resetDistrictSelection) {
      this.profileForm.get("district")?.setValue("");
    }

    this.cdr.markForCheck();
  }

  // =========================================================
  // PUBLIC PATCH METHOD
  // =========================================================
  // Can be used later if another component/service
  // wants to populate this form.

  public patchProfileData(
    data: Partial<{
      fullName: string;
      dob: string;
      gender: string;
      state: string;
      district: string;
      occupation: string;
      organization: string;
      phone: string;
      email: string;
    }>,
  ): void {
    if (data.state) {
      this.updateDistrictList(data.state, false);
    }

    this.profileForm.patchValue(data);

    this.cdr.markForCheck();
  }

  // =========================================================
  // FORM CONTROLS
  // =========================================================

  get f() {
    return this.profileForm.controls;
  }

  // =========================================================
  // BREADCRUMB (Home > Profile > Edit Profile)
  // =========================================================

  get breadcrumbItems(): BreadcrumbItem[] {
    const prefix = this.dashboardPrefix();
    if (!prefix) {
      return [];
    }
    return [
      { label: "Home", route: ["/dashboard", prefix] },
      { label: "Profile", route: ["/dashboard", prefix, "profile"] },
      { label: "Edit Profile" },
    ];
  }

  private dashboardPrefix(): string | null {
    const url = this.router.url || "";
    if (url.startsWith("/dashboard/admin")) return "admin";
    if (url.startsWith("/dashboard/citizen")) return "citizen";
    if (url.startsWith("/dashboard/government")) return "government";
    if (url.startsWith("/dashboard/researcher")) return "researcher";
    if (url.startsWith("/dashboard/organization")) return "organization";
    return null;
  }

  // =========================================================
  // NAVIGATE TO CORRECT PROFILE
  // =========================================================

  private navigateToProfile(): void {
    const currentUrl = this.router.url;

    if (currentUrl.startsWith("/dashboard/admin")) {
      this.router.navigate(["/dashboard/admin/profile"]);
      return;
    }

    if (currentUrl.startsWith("/dashboard/citizen")) {
      this.router.navigate(["/dashboard/citizen/profile"]);
      return;
    }

    if (currentUrl.startsWith("/dashboard/government")) {
      this.router.navigate(["/dashboard/government/profile"]);
      return;
    }

    if (currentUrl.startsWith("/dashboard/researcher")) {
      this.router.navigate(["/dashboard/researcher/profile"]);
      return;
    }

    if (currentUrl.startsWith("/dashboard/user-dashboard")) {
      this.router.navigate(["/dashboard/user-dashboard/profile"]);
      return;
    }

    this.router.navigate(["/auth/login"]);
  }

  // =========================================================
  // BACK
  // =========================================================

  goBack(): void {
    this.navigateToProfile();
  }

  // =========================================================
  // CHANGE PHOTO
  // =========================================================

  onPhotoSelected(event: Event): void {
    const target = event.target as HTMLInputElement;

    if (!target.files || !target.files[0]) {
      return;
    }

    const file = target.files[0];

    // Reset the input so choosing the same file again still fires.
    target.value = "";

    // Client-side validation mirrors the backend rules (the backend
    // re-validates the actual bytes and remains authoritative).
    const validationError = this.avatarService.validateImageFile(file);

    if (validationError) {
      this.photoError = validationError;
      this.cdr.markForCheck();
      return;
    }

    this.photoError = "";
    this.pendingPhotoFile = file;
    this.removePhotoRequested = false;

    // Immediate local preview; the file is uploaded on Save Changes.
    const reader = new FileReader();

    reader.onload = () => {
      this.selectedPhotoUrl = reader.result as string;

      this.cdr.markForCheck();
    };

    reader.onerror = () => {
      this.photoError = "Unable to read the selected image.";
      this.pendingPhotoFile = null;
      this.cdr.markForCheck();
    };

    reader.readAsDataURL(file);
  }

  /**
   * Discard the pending selection / mark the persisted photo for
   * removal on Save. The backend reference is only cleared when the
   * user confirms via Save Changes.
   */
  onRemovePhoto(): void {
    this.pendingPhotoFile = null;
    this.removePhotoRequested = true;
    this.selectedPhotoUrl = null;
    this.photoError = "";
    this.cdr.markForCheck();
  }

  // =========================================================
  // SAVE PROFILE
  // =========================================================

  onSave(): void {
    if (this.saving) {
      return;
    }

    this.successMessage = "";
    this.errorMessage = "";

    if (this.profileForm.invalid) {
      this.profileForm.markAllAsTouched();
      this.errorMessage = "Please correct the highlighted fields.";
      this.cdr.markForCheck();
      return;
    }

    this.saving = true;
    this.cdr.markForCheck();

    // Photo first (if changed): a failed upload aborts the save so a
    // "Profile Updated" message is never shown for a failed photo.
    // AvatarService already applies the project's 30s timeout.
    const photoRequest: Observable<AuthUser | null> = this.pendingPhotoFile
      ? this.avatarService.uploadPhoto(this.pendingPhotoFile)
      : this.removePhotoRequested
        ? this.avatarService.removePhoto()
        : of(null);

    photoRequest.subscribe({
      next: (photoUser: AuthUser | null) => {
        if (photoUser) {
          this.currentUser = photoUser;
          this.authService.publishCurrentUser(photoUser);
          this.pendingPhotoFile = null;
          this.removePhotoRequested = false;
        }
        this.saveProfileFields();
      },
      error: (photoError: unknown) => {
        console.error("Unable to update profile photo:", photoError);
        this.saving = false;
        this.errorMessage = this.photoErrorMessage(photoError);
        this.cdr.markForCheck();
      },
    });
  }

  /**
   * True when the text fields match the current shared user and no
   * photo change is pending — saving would be a wasted expensive round
   * trip (PUT + audit commit + refresh), so skip the API entirely.
   */
  private hasNoChanges(payload: {
    full_name: string;
    phone: string;
    gender: string | null;
    date_of_birth: string | null;
    state: string | null;
    district: string | null;
    occupation: string | null;
    organization: string | null;
  }): boolean {
    if (this.pendingPhotoFile || this.removePhotoRequested) {
      return false;
    }
    const current = this.currentUser;
    if (!current) {
      return false;
    }
    const norm = (value: string | null | undefined) =>
      (value ?? "").trim();
    const normDob = (value: string | null | undefined) =>
      value ? this.formatDateForInput(String(value)) : "";
    return (
      norm(payload.full_name) === norm(current.full_name) &&
      norm(payload.phone) ===
        norm(this.cleanPhone(current.phone || "")) &&
      norm(payload.gender) === norm(current.gender) &&
      normDob(payload.date_of_birth) ===
        normDob(current.date_of_birth as unknown as string) &&
      norm(payload.state) === norm(current.state) &&
      norm(payload.district) === norm(current.district) &&
      norm(payload.occupation) === norm(current.occupation) &&
      norm(payload.organization) === norm(current.organization)
    );
  }

  /**
   * Persist the text profile fields. Runs after any photo change, so
   * one Save Changes click covers the whole form. Uses the PUT response
   * directly for shared state — no follow-up /me fetch.
   */
  private saveProfileFields(): void {
    const formValue = this.profileForm.getRawValue();

    const payload = {
      full_name: String(formValue.fullName || "").trim(),
      phone: String(formValue.phone || "").trim(),
      gender: String(formValue.gender || "").trim() || null,
      date_of_birth: formValue.dob || null,
      state: formValue.state || null,
      district: formValue.district || null,
      occupation: formValue.occupation || null,
      organization: formValue.organization || null,
    };

    // No-op save: skip the expensive PUT + audit round trip entirely.
    if (this.hasNoChanges(payload)) {
      this.saving = false;
      this.successMessage = "No changes to save.";
      this.errorMessage = "";
      this.cdr.markForCheck();
      this.navigateToProfile();
      return;
    }

    this.http
      .put<AuthUser>(`${this.apiUrl}/profile`, payload)
      .pipe(timeout(EditProfileComponent.SAVE_TIMEOUT_MS))
      .subscribe({
        next: (updatedUser: AuthUser) => {
          this.currentUser = updatedUser || this.currentUser;
          if (updatedUser) {
            // Shared state: topbar/sidebar/profile update immediately.
            this.authService.publishCurrentUser(updatedUser);
            this.patchUserData(updatedUser);
          }
          this.saving = false;
          this.successMessage = "Profile updated successfully.";
          this.errorMessage = "";
          this.toast.success(
            "Profile updated",
            "Your changes were saved.",
          );
          this.cdr.markForCheck();

          this.navigateToProfile();
        },
        error: (error: unknown) => {
          console.error("Unable to update profile:", error);
          this.saving = false;

          const response = error as {
            status?: number;
            name?: string;
            error?: { detail?: string | { msg?: string }[] };
          };

          if (response?.name === "TimeoutError") {
            this.errorMessage =
              "Saving is taking too long. Please check your connection and try again.";
            this.toast.error(
              "Save timed out",
              "Please check your connection and try again.",
            );
            this.cdr.markForCheck();
            return;
          }

          let detail = response?.error?.detail;
          if (Array.isArray(detail)) {
            detail = detail
              .map((item) => item?.msg || "Invalid value")
              .join("; ");
          }

          this.errorMessage =
            String(detail || "") ||
            (response?.status === 400
              ? "Invalid profile information."
              : response?.status === 401
                ? "Your session has expired. Please log in again."
                : response?.status === 409
                  ? "This phone number is already registered."
                  : "Unable to update your profile. Please try again.");

          this.cdr.markForCheck();
        },
      });
  }

  /**
   * User-friendly message for photo upload/removal failures. The
   * profile fields are untouched in this case (save aborted first).
   */
  private photoErrorMessage(error: unknown): string {
    const response = error as {
      status?: number;
      error?: { detail?: string };
      name?: string;
    };
    if (response?.name === "TimeoutError") {
      return "Photo upload timed out. Please try again.";
    }
    const detail =
      typeof response?.error?.detail === "string"
        ? response.error.detail
        : "";
    if (detail) {
      return detail;
    }
    switch (response?.status) {
      case 401:
        return "Your session has expired. Please log in again.";
      case 403:
        return "Profile photos are not available for this account.";
      case 413:
        return "Profile photo must be 5 MB or smaller.";
      case 422:
        return "Only JPG, PNG, and WEBP images are allowed.";
      default:
        return "Unable to update the profile photo. Please try again.";
    }
  }
}
