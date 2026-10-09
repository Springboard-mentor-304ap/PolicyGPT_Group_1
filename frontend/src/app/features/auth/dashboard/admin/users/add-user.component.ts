import { ChangeDetectorRef, Component, HostListener } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { Router } from "@angular/router";
import { Auth, AuthResponse } from "../../../../../core/services/auth";
import { SearchableSelectComponent } from "../../../../../shared/components/searchable-select/searchable-select.component";

type AdminUserRole = "GOVERNMENT_OFFICIAL" | "ADMINISTRATOR";

@Component({
  selector: "app-add-user",
  standalone: true,

  imports: [CommonModule, FormsModule, SearchableSelectComponent],

  templateUrl: "./add-user.component.html",
  styleUrl: "./add-user.component.scss",
})
export class AddUserComponent {
  // =====================================================
  // FORM FIELDS
  // =====================================================

  fullName = "";
  email = "";
  phone = "";

  password = "";
  confirmPassword = "";

  dateOfBirth = "";
  state = "";
  district = "";

  occupation = "";
  organization = "";

  // =====================================================
  // USER ROLE
  // =====================================================

  selectedRole: AdminUserRole = "GOVERNMENT_OFFICIAL";

  // =====================================================
  // PASSWORD VISIBILITY
  // =====================================================

  showPassword = false;
  showConfirmPassword = false;

  // =====================================================
  // STATES
  // =====================================================

  states: string[] = [
    "Andhra Pradesh",
    "Arunachal Pradesh",
    "Assam",
    "Bihar",
    "Chhattisgarh",
    "Goa",
    "Gujarat",
    "Haryana",
    "Himachal Pradesh",
    "Jharkhand",
    "Karnataka",
    "Kerala",
    "Madhya Pradesh",
    "Maharashtra",
    "Manipur",
    "Meghalaya",
    "Mizoram",
    "Nagaland",
    "Odisha",
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

  // =====================================================
  // DISTRICTS
  // =====================================================

  districts: Record<string, string[]> = {
    "Andhra Pradesh": [
      "Anantapur",
      "Chittoor",
      "East Godavari",
      "Guntur",
      "Krishna",
      "Kurnool",
      "Nellore",
      "Prakasam",
      "Srikakulam",
      "Visakhapatnam",
      "Vizianagaram",
      "West Godavari",
      "Kadapa",
    ],

    "Arunachal Pradesh": [
      "Tawang",
      "West Kameng",
      "East Kameng",
      "Papum Pare",
      "Kurung Kumey",
      "Kra Daadi",
      "Lower Subansiri",
      "Upper Subansiri",
      "West Siang",
      "East Siang",
      "Siang",
      "Upper Siang",
      "Lower Siang",
      "Changlang",
      "Tirap",
      "Longding",
      "Lohit",
      "Namsai",
      "Anjaw",
      "Dibang Valley",
      "Lower Dibang Valley",
    ],

    Assam: [
      "Baksa",
      "Barpeta",
      "Biswanath",
      "Bongaigaon",
      "Cachar",
      "Charaideo",
      "Darrang",
      "Dhemaji",
      "Dhubri",
      "Dibrugarh",
      "Goalpara",
      "Golaghat",
      "Hailakandi",
      "Jorhat",
      "Kamrup",
      "Kamrup Metropolitan",
      "Karbi Anglong",
      "Karimganj",
      "Lakhimpur",
      "Majuli",
      "Morigaon",
      "Nagaon",
      "Nalbari",
      "Sivasagar",
      "Sonitpur",
      "Tinsukia",
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
      "Kishanganj",
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
      "Sitamarhi",
      "Siwan",
      "Supaul",
      "Vaishali",
      "West Champaran",
    ],

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
      "Mungeli",
      "Narayanpur",
      "Raigarh",
      "Raipur",
      "Rajnandgaon",
      "Sukma",
      "Surajpur",
      "Surguja",
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
      "Hazaribagh",
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
      "Chikkaballapur",
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
      "Indore",
      "Jabalpur",
      "Jhabua",
      "Katni",
      "Khandwa",
      "Khargone",
      "Mandla",
      "Mandsaur",
      "Morena",
      "Narmadapuram",
      "Narsinghpur",
      "Neemuch",
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
      "Saitual",
      "Serchhip",
    ],

    Nagaland: [
      "Chumoukedima",
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
      "Jagatsinghpur",
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
      "Subarnapur",
      "Sundargarh",
    ],

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
      "Pathankot",
      "Patiala",
      "Rupnagar",
      "Sangrur",
      "SAS Nagar",
      "Shaheed Bhagat Singh Nagar",
      "Sri Muktsar Sahib",
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

    Sikkim: ["East Sikkim", "North Sikkim", "South Sikkim", "West Sikkim"],

    "Tamil Nadu": [
      "Ariyalur",
      "Chengalpattu",
      "Chennai",
      "Coimbatore",
      "Cuddalore",
      "Dharmapuri",
      "Dindigul",
      "Erode",
      "Kallakurichi",
      "Kancheepuram",
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
      "Tiruvarur",
      "Vellore",
      "Viluppuram",
      "Virudhunagar",
    ],

    Telangana: [
      "Adilabad",
      "Bhadradri Kothagudem",
      "Hyderabad",
      "Jagtial",
      "Jangaon",
      "Jayashankar Bhupalpally",
      "Jogulamba Gadwal",
      "Kamareddy",
      "Karimnagar",
      "Khammam",
      "Komaram Bheem",
      "Mahabubabad",
      "Mahbubnagar",
      "Mancherial",
      "Medak",
      "Medchal-Malkajgiri",
      "Mulugu",
      "Nagarkurnool",
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
      "Ayodhya",
      "Azamgarh",
      "Bareilly",
      "Badaun",
      "Baghpat",
      "Bahraich",
      "Ballia",
      "Balrampur",
      "Barabanki",
      "Basti",
      "Bhadohi",
      "Bijnor",
      "Bulandshahr",
      "Chandauli",
      "Chitrakoot",
      "Deoria",
      "Etah",
      "Etawah",
      "Farrukhabad",
      "Fatehpur",
      "Firozabad",
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
      "Kanpur Dehat",
      "Kanpur Nagar",
      "Kasganj",
      "Kaushambi",
      "Kushinagar",
      "Lakhimpur Kheri",
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
      "Paschim Bardhaman",
      "Purba Bardhaman",
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
      "Maldah",
      "Murshidabad",
      "Nadia",
      "North 24 Parganas",
      "South 24 Parganas",
      "Paschim Medinipur",
      "Purba Medinipur",
      "Uttar Dinajpur",
    ],
  };

  // =====================================================
  // UI STATE
  // =====================================================

  isSubmitting = false;

  successMessage = "";
  errorMessage = "";

  // =====================================================
  // POPUP STATE
  // =====================================================

  showSuccessPopup = false;
  popupTitle = "";
  popupMessage = "";
  popupIcon = "check";
  popupType: "success" | "error" = "success";

  // =====================================================
  // CONSTRUCTOR
  // =====================================================

  constructor(
    private authService: Auth,
    private router: Router,
    private cdr: ChangeDetectorRef,
  ) {}

  // =====================================================
  // DISTRICT OPTIONS
  // =====================================================

  get districtOptions(): string[] {
    return this.districts[this.state] || [];
  }

  // =====================================================
  // STATE CHANGE
  // =====================================================

  onStateChange(): void {
    this.district = "";
  }

  // =====================================================
  // SELECT ROLE
  // =====================================================

  selectRole(role: AdminUserRole): void {
    this.selectedRole = role;

    this.errorMessage = "";
    this.successMessage = "";

    if (role === "ADMINISTRATOR") {
      this.occupation = "";
      this.organization = "";
    }
  }

  // =====================================================
  // PASSWORD TOGGLE
  // =====================================================

  togglePassword(): void {
    this.showPassword = !this.showPassword;
  }

  toggleConfirmPassword(): void {
    this.showConfirmPassword = !this.showConfirmPassword;
  }

  // =====================================================
  // ADD USER
  // =====================================================

  addUser(): void {
    // Never allow an old popup state to remain when a new submission starts.
    this.showSuccessPopup = false;
    this.successMessage = "";
    this.errorMessage = "";

    // -----------------------------------------------------
    // VALIDATION
    // -----------------------------------------------------

    if (!this.fullName.trim()) {
      this.errorMessage = "Please enter full name.";
      return;
    }

    if (!this.email.trim()) {
      this.errorMessage = "Please enter email.";
      return;
    }

    if (!this.phone.trim()) {
      this.errorMessage = "Please enter phone number.";
      return;
    }

    if (!/^\d{10}$/.test(this.phone.trim())) {
      this.errorMessage = "Please enter a valid 10 digit phone number.";
      return;
    }

    if (!this.password) {
      this.errorMessage = "Please enter password.";
      return;
    }

    if (!this.confirmPassword) {
      this.errorMessage = "Please confirm password.";
      return;
    }

    if (this.password !== this.confirmPassword) {
      this.openPopup(
        "error",
        "Password Mismatch",
        "Password and confirm password do not match.",
        "error",
      );
      return;
    }

    if (!this.dateOfBirth) {
      this.errorMessage = "Please select date of birth.";
      return;
    }

    if (!this.state.trim()) {
      this.errorMessage = "Please select state.";
      return;
    }

    if (!this.district.trim()) {
      this.errorMessage = "Please select district.";
      return;
    }

    if (
      this.selectedRole === "GOVERNMENT_OFFICIAL" &&
      !this.occupation.trim()
    ) {
      this.errorMessage = "Please enter designation / occupation.";
      return;
    }

    if (
      this.selectedRole === "GOVERNMENT_OFFICIAL" &&
      !this.organization.trim()
    ) {
      this.errorMessage = "Please enter government department / organization.";
      return;
    }

    // -----------------------------------------------------
    // PAYLOAD
    // -----------------------------------------------------

    const payload = {
      name: this.fullName.trim(),

      email: this.email.trim().toLowerCase(),

      phone: this.phone.trim(),

      password: this.password,

      confirmPassword: this.confirmPassword,

      dob: this.dateOfBirth,

      state: this.state.trim(),

      district: this.district.trim(),

      occupation: this.occupation.trim(),

      organization: this.organization.trim(),

      role: this.selectedRole,
    };

    // -----------------------------------------------------
    // BACKEND
    // -----------------------------------------------------

    this.isSubmitting = true;

    this.authService.register(payload, false).subscribe({
      // ===============================================
      // SUCCESS
      // ===============================================

      next: (response: AuthResponse) => {
        console.log("User created successfully:", response);

        this.isSubmitting = false;

        this.successMessage = "";
        this.errorMessage = "";

        // Show success popup.
        this.openPopup(
          "success",
          "Account Created Successfully",
          "The new user account has been created successfully.",
          "check",
        );
      },

      // ===============================================
      // ERROR
      // ===============================================

      error: (error: unknown) => {
        console.error("Unable to create user:", error);

        this.isSubmitting = false;

        const errorResponse = error as {
          status?: number;
          error?: {
            detail?:
              | string
              | Array<{
                  msg?: string;
                }>;
          };
          message?: string;
        };

        const detail = errorResponse?.error?.detail;

        const detailText = Array.isArray(detail)
          ? detail
              .map((item) => item?.msg || "")
              .filter(Boolean)
              .join(" ")
          : typeof detail === "string"
            ? detail
            : "";

        const message = detailText.toLowerCase();

        // -------------------------------------------------
        // HTTP 409 - ACCOUNT ALREADY EXISTS
        // -------------------------------------------------
        if (errorResponse?.status === 409) {
          const duplicateMessage =
            message.includes("phone") || message.includes("mobile")
              ? "An account already exists with this phone number."
              : message.includes("email") || message.includes("registered")
                ? "An account already exists with this email."
                : "An account already exists with this email or phone number.";

          this.openPopup(
            "error",
            "Account Already Exists",
            duplicateMessage,
            "error",
          );

          return;
        }

        // -------------------------------------------------
        // DUPLICATE EMAIL
        // -------------------------------------------------

        if (
          message.includes("email") &&
          (message.includes("already") ||
            message.includes("exist") ||
            message.includes("registered") ||
            message.includes("duplicate"))
        ) {
          this.openPopup(
            "error",
            "Account Already Exists",
            "An account already exists with this email.",
            "error",
          );
          return;
        }

        // -------------------------------------------------
        // DUPLICATE PHONE
        // -------------------------------------------------

        if (
          (message.includes("phone") ||
            message.includes("mobile") ||
            message.includes("contact number")) &&
          (message.includes("already") ||
            message.includes("exist") ||
            message.includes("registered") ||
            message.includes("duplicate"))
        ) {
          this.openPopup(
            "error",
            "Account Already Exists",
            "An account already exists with this phone number.",
            "error",
          );
          return;
        }

        // -------------------------------------------------
        // BOTH EMAIL AND PHONE
        // -------------------------------------------------

        if (
          message.includes("email") &&
          (message.includes("phone") || message.includes("mobile"))
        ) {
          this.openPopup(
            "error",
            "Account Already Exists",
            "An account already exists with this email or phone number.",
            "error",
          );
          return;
        }

        // -------------------------------------------------
        // OTHER BACKEND ERROR
        // -------------------------------------------------

        const finalMessage =
          detailText ||
          errorResponse?.message ||
          "Unable to create the account. Please try again.";

        this.openPopup(
          "error",
          "Unable to Create Account",
          finalMessage,
          "error",
        );
      },
    });
  }

  // =====================================================
  // CLOSE POPUP WITH ESCAPE
  // =====================================================

  @HostListener("document:keydown.escape")
  onEscapeKey(): void {
    if (this.showSuccessPopup) {
      this.closeSuccessPopup();
    }
  }

  // =====================================================
  // OPEN POPUP
  // =====================================================

  openPopup(
    type: "success" | "error",
    title: string,
    message: string,
    icon: string,
  ): void {
    this.popupType = type;
    this.popupTitle = title;
    this.popupMessage = message;
    this.popupIcon = icon;
    this.showSuccessPopup = true;

    // Render the popup immediately after the HTTP response.
    this.cdr.detectChanges();
  }

  // =====================================================
  // CLOSE POPUP
  // =====================================================

  closeSuccessPopup(): void {
    const wasSuccess = this.popupType === "success";

    this.showSuccessPopup = false;
    this.popupTitle = "";
    this.popupMessage = "";
    this.popupIcon = "check";

    // Only successful creation resets the form.
    // Error popups keep the entered data.
    if (wasSuccess) {
      this.resetForm();
    }
  }

  // =====================================================
  // RESET FORM
  // =====================================================

  resetForm(): void {
    this.fullName = "";
    this.email = "";
    this.phone = "";

    this.password = "";
    this.confirmPassword = "";

    this.dateOfBirth = "";

    this.state = "";
    this.district = "";

    this.occupation = "";
    this.organization = "";

    this.selectedRole = "GOVERNMENT_OFFICIAL";

    this.showPassword = false;
    this.showConfirmPassword = false;

    this.successMessage = "";
    this.errorMessage = "";

    this.isSubmitting = false;
  }

  // =====================================================
  // ADMIN DASHBOARD
  // =====================================================

  goToDashboard(): void {
    this.router.navigate(["/dashboard/admin"]);
  }

  // =====================================================
  // USERS
  // =====================================================

  goToUsers(): void {
    this.router.navigate(["/dashboard/admin/users"], {
      queryParams: {
        section: "view",
      },
    });
  }
}
